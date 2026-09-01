import { ChangeEvent, useMemo, useState } from "react";
import {
  completeVideoUpload,
  initVideoUpload,
  uploadVideoToStorage,
} from "./api/videoApi";
import type { UploadStatus } from "./types/video";

function formatFileSize(bytes: number): string {
  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unitIndex;

  if (unitIndex === 0) {
    return `${value} ${units[unitIndex]}`;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function getStatusMessage(status: UploadStatus, selectedFile: File | null): string {
  if (!selectedFile) {
    return "Файл не выбран";
  }

  switch (status) {
    case "initializing":
      return "Инициализация загрузки...";
    case "uploading":
      return "Загрузка видео...";
    case "completing":
      return "Подтверждение загрузки...";
    case "success":
      return "Видео успешно загружено";
    case "error":
      return "Ошибка загрузки видео";
    case "selected":
    case "initial":
    default:
      return `Выбран файл: ${selectedFile.name}`;
  }
}

function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadStatus>("initial");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [uploadedUuid, setUploadedUuid] = useState("");

  const isBusy = status === "initializing" || status === "uploading" || status === "completing";
  const isUploadDisabled = !selectedFile || isBusy;
  const readableSize = useMemo(
    () => (selectedFile ? formatFileSize(selectedFile.size) : ""),
    [selectedFile]
  );

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;

    setSelectedFile(file);
    setStatus(file ? "selected" : "initial");
    setProgress(0);
    setErrorMessage("");
    setUploadedUuid("");
  }

  async function handleUpload() {
    if (!selectedFile || isBusy) {
      return;
    }

    setProgress(0);
    setErrorMessage("");
    setUploadedUuid("");

    let uuid = "";
    let failedStage: "init" | "storage" = "init";

    try {
      setStatus("initializing");
      const uploadData = await initVideoUpload(selectedFile);
      uuid = uploadData.uuid;

      failedStage = "storage";
      setStatus("uploading");
      await uploadVideoToStorage(selectedFile, uploadData, setProgress);
    } catch (error) {
      setStatus("error");
      setErrorMessage(
        failedStage === "init"
          ? "Не удалось инициализировать загрузку"
          : "Не удалось загрузить файл в хранилище"
      );
      return;
    }

    try {
      setStatus("completing");
      await completeVideoUpload(uuid);

      setUploadedUuid(uuid);
      setStatus("success");
    } catch (error) {
      setStatus("error");
      setUploadedUuid(uuid);
      setErrorMessage(
        "Видео загружено в хранилище, но не удалось подтвердить завершение загрузки"
      );
    }
  }

  const statusMessage = getStatusMessage(status, selectedFile);
  const showProgress = status === "uploading" || status === "completing" || status === "success";

  return (
    <main className="page">
      <section className="upload-card" aria-labelledby="upload-title">
        <div className="card-header">
          <p className="eyebrow">PROM APP</p>
          <h1 id="upload-title">Загрузка видео</h1>
        </div>

        <label className="file-picker">
          <span>Выбрать файл</span>
          <input type="file" accept="video/*" onChange={handleFileChange} disabled={isBusy} />
        </label>

        <div className="file-info" aria-live="polite">
          {selectedFile ? (
            <>
              <p>Имя файла: {selectedFile.name}</p>
              <p>Размер: {readableSize}</p>
            </>
          ) : (
            <p>Файл не выбран</p>
          )}
        </div>

        {showProgress && (
          <div className="progress-block" aria-label="Прогресс загрузки">
            <progress value={progress} max="100" />
            <span>{progress}%</span>
          </div>
        )}

        <button type="button" onClick={handleUpload} disabled={isUploadDisabled}>
          Загрузить видео
        </button>

        <div className={`status status-${status}`} aria-live="polite">
          <p>{statusMessage}</p>
          {errorMessage && <p className="error-text">{errorMessage}</p>}
          {uploadedUuid && <p className="uuid">UUID: {uploadedUuid}</p>}
        </div>
      </section>
    </main>
  );
}

export default App;
