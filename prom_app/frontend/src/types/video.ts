export interface InitUploadResponse {
  uuid: string;
  upload_url: string;
  storage_key: string;
}

export type UploadStatus =
  | "initial"
  | "selected"
  | "initializing"
  | "uploading"
  | "completing"
  | "success"
  | "error";
