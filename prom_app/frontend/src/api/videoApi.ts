import type { InitUploadResponse } from "../types/video";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

function joinUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const normalizedPath = path.replace(/^\/+/, "");

  if (!normalizedBase) {
    return `/${normalizedPath}`;
  }

  return `${normalizedBase}/${normalizedPath}`;
}

function buildStorageObjectUrl(uploadUrl: string, uuid: string, fileName: string): string {
  const normalizedUploadUrl = uploadUrl.replace(/\/+$/, "");
  return `${normalizedUploadUrl}/${encodeURIComponent(uuid)}/${encodeURIComponent(fileName)}`;
}

async function readErrorBody(response: Response): Promise<string> {
  const text = await response.text();
  return text.trim();
}

export async function initVideoUpload(file: File): Promise<InitUploadResponse> {
  const response = await fetch(joinUrl(API_BASE_URL, "/api/videos/init-upload"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file_name: file.name,
      size: file.size,
    }),
  });

  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new Error(body || `Init upload failed with status ${response.status}`);
  }

  const data = (await response.json()) as InitUploadResponse;

  if (!data.uuid || !data.upload_url || !data.storage_key) {
    throw new Error("Init upload response has invalid shape");
  }

  return data;
}

export function uploadVideoToStorage(
  file: File,
  uploadData: InitUploadResponse,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const objectUrl = buildStorageObjectUrl(uploadData.upload_url, uploadData.uuid, file.name);

    xhr.open("PUT", objectUrl);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    xhr.upload.onprogress = (event: ProgressEvent) => {
      if (event.lengthComputable && event.total > 0) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
        return;
      }

      reject(new Error(`Storage upload failed with status ${xhr.status}`));
    };

    xhr.onerror = () => {
      reject(new Error("Storage upload network error"));
    };

    xhr.onabort = () => {
      reject(new Error("Storage upload aborted"));
    };

    xhr.send(file);
  });
}

export async function completeVideoUpload(uuid: string): Promise<void> {
  const response = await fetch(
    joinUrl(API_BASE_URL, `/api/videos/${encodeURIComponent(uuid)}/upload-complete`),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    }
  );

  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new Error(body || `Complete upload failed with status ${response.status}`);
  }
}
