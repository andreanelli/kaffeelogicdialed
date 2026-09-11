export async function api<T = unknown>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    let message = "Request failed";
    try {
      message = (await response.json()).error || message;
    } catch {
      /* non-JSON response */
    }
    throw new Error(message);
  }
  return response.json();
}
export function upload(file: File) {
  return new Promise<{ id: string; duplicate: boolean }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () =>
      api<{ id: string; duplicate: boolean }>("/files", {
        name: file.name,
        base64: String(reader.result).split(",")[1],
      }).then(resolve, reject);
    reader.readAsDataURL(file);
  });
}
