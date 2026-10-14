export function cloudExtractionEnabled(): boolean {
  return process.env.ALLOW_CLOUD_EXTRACTION === "true" && process.env.EXTRACTION_MODE === "cloud";
}
