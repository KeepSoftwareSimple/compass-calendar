export function timeZoneCityName(id: string): string {
  const last = id.split("/").pop() ?? id;
  return last.replaceAll("_", " ");
}
