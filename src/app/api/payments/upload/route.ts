import { todayInTimeZone } from "@/lib/dates";
import { outboundImage, privateImage } from "@/lib/extract/image";
import { interpretModel } from "@/lib/extract/interpret";
import { extractLocally } from "@/lib/extract/local";
import { cloudExtractionEnabled } from "@/lib/extract/privacy";
import { extractPayment } from "@/lib/extract/vision";
import { requireUser } from "@/lib/http";
import { formatStoredAmount } from "@/lib/money";
import type { EmployeeOption, UploadReview } from "@/lib/types";

export const maxDuration = 60;

const MAX_FILES = 8;
const MAX_BYTES = 8 * 1024 * 1024;

function safeName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 80);
  return cleaned || "screenshot";
}

export async function GET() {
  const { errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;
  return Response.json({ cloud_extraction: cloudExtractionEnabled() });
}

export async function POST(request: Request) {
  const { supabase, user, errorResponse } = await requireUser();
  if (errorResponse || !user) return errorResponse;

  const form = await request.formData().catch(() => null);
  const files = form?.getAll("files").filter((item): item is File => item instanceof File) ?? [];
  if (!files.length) return Response.json({ error: "Choose at least one screenshot." }, { status: 400 });
  if (files.length > MAX_FILES) return Response.json({ error: `Upload up to ${MAX_FILES} screenshots at a time.` }, { status: 400 });

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("company_id, companies(timezone)")
    .eq("id", user.id)
    .single();
  if (profileError || !profile) return Response.json({ error: "Your account is not attached to a company." }, { status: 403 });

  const companyEmbed = profile.companies as { timezone: string } | { timezone: string }[] | null;
  const timezone = (Array.isArray(companyEmbed) ? companyEmbed[0]?.timezone : companyEmbed?.timezone) || "America/Chicago";
  const { data: employees, error: employeeError } = await supabase
    .from("employees")
    .select("id, full_name, employee_code, active, role_title")
    .order("full_name");
  if (employeeError) return Response.json({ error: employeeError.message }, { status: 400 });

  const reviews: UploadReview[] = [];
  const failures: Array<{ file_name: string; error: string }> = [];
  const sendToProvider = form?.get("destination") === "cloud" && cloudExtractionEnabled();

  for (const file of files) {
    const fileName = safeName(file.name);
    if (file.size <= 0 || file.size > MAX_BYTES) {
      failures.push({ file_name: file.name, error: "Screenshots must be smaller than 8 MB." });
      continue;
    }
    const original = Buffer.from(await file.arrayBuffer());
    const stored = await privateImage(original);
    if (!stored) {
      failures.push({ file_name: file.name, error: "Use a PNG, JPEG, or WebP photo. iPhone photos are converted when the phone allows it." });
      continue;
    }

    const screenshotId = crypto.randomUUID();
    const storagePath = `${profile.company_id}/${screenshotId}.${stored.ext}`;
    let model = null;
    let extractionError: string | null = null;
    const mode = sendToProvider ? "cloud" : "local";
    try {
      if (sendToProvider) {
        const outbound = await outboundImage(stored.bytes);
        model = await extractPayment(outbound.bytes, outbound.mime);
      } else {
        model = await extractLocally(stored.bytes);
      }
    } catch (error) {
      extractionError = error instanceof Error ? error.message : "The screenshot could not be read.";
    }

    const confirmation = model?.confirmation_number?.trim();
    let duplicate: UploadReview["duplicate"] = null;
    if (confirmation) {
      const { data: existing } = await supabase
        .from("payments")
        .select("id, amount, period_start, period_end, employee:employees(full_name)")
        .eq("counts_toward_totals", true)
        .ilike("confirmation_number", confirmation.replace(/[%_]/g, ""))
        .limit(1)
        .maybeSingle();
      if (existing) {
        const employee = existing.employee as { full_name: string } | { full_name: string }[] | null;
        const employeeName = Array.isArray(employee) ? employee[0]?.full_name : employee?.full_name;
        duplicate = {
          payment_id: existing.id,
          employee_name: employeeName ?? "an employee",
          period_start: existing.period_start,
          period_end: existing.period_end,
          amount: formatStoredAmount(existing.amount) ?? "",
        };
      }
    }

    const uploaded = await supabase.storage.from("payment-screenshots").upload(storagePath, stored.bytes, {
      contentType: stored.mime,
      upsert: false,
    });
    if (uploaded.error) {
      failures.push({ file_name: file.name, error: "The screenshot could not be stored." });
      continue;
    }

    const review = interpretModel({
      model,
      employees: employees ?? [],
      today: todayInTimeZone(timezone),
      fileName,
      screenshotId,
      duplicate,
      extractionError,
    });
    const signed = await supabase.storage.from("payment-screenshots").createSignedUrl(storagePath, 60 * 30);
    review.preview_url = signed.data?.signedUrl ?? null;

    const inserted = await supabase.from("payment_screenshots").insert({
      id: screenshotId,
      company_id: profile.company_id,
      storage_path: storagePath,
      file_name: fileName,
      mime_type: stored.mime,
      byte_size: stored.bytes.length,
      extraction: { mode, model, warnings: review.warnings, fields: review.fields },
      uploaded_by: user.id,
    });
    if (inserted.error) {
      failures.push({ file_name: file.name, error: "The screenshot record could not be saved." });
      continue;
    }
    reviews.push(review);
  }

  return Response.json({
    uploads: reviews,
    failures,
    employees: (employees ?? []) as EmployeeOption[],
  });
}
