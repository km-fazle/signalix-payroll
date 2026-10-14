export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(url, { ...init, headers });
  const body = (await response.json().catch(() => ({}))) as { error?: string; duplicate_of?: string };
  if (!response.ok) {
    const error = new Error(body.error || "The request could not be completed.") as Error & {
      status?: number;
      duplicate_of?: string;
    };
    error.status = response.status;
    error.duplicate_of = body.duplicate_of;
    throw error;
  }
  return body as T;
}

export async function download(url: string, filename: string) {
  const response = await fetch(url);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || "The export could not be prepared.");
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(objectUrl);
}
