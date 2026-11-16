import { useState } from "react";
import { uploadProjectImage } from "../api";
import type { ProjectMedia } from "../types";

interface Props {
  projectId: string;
  onUploaded: (media: ProjectMedia) => void;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export default function ProjectImageUpload({
  projectId,
  onUploaded,
}: Props) {
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    setError("");
    setSuccess("");
    setImage(null);
    setPreview("");

    if (!file) return;

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ];

    if (!allowedTypes.includes(file.type)) {
      setError("Choose a JPEG, PNG, WEBP, or GIF image.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError("Image must be 5 MB or smaller.");
      event.target.value = "";
      return;
    }

    setImage(file);
    setPreview(URL.createObjectURL(file));
  }

  async function handleUpload() {
    if (!image) {
      setError("Please select an image first.");
      return;
    }

    try {
      setUploading(true);
      setError("");
      setSuccess("");

      const media = await uploadProjectImage(projectId, image);

      onUploaded(media);

      setImage(null);
      setPreview("");
      setSuccess("Image uploaded successfully.");

      const input = document.getElementById(
        "project-image"
      ) as HTMLInputElement | null;

      if (input) input.value = "";
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to upload image."
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="project-image-upload">
      <h2>Project Images</h2>

      <p>
        Upload an image to showcase your project.
        Supported formats: JPEG, PNG, WEBP, and GIF.
        Maximum size: 5 MB.
      </p>

      <div className="form-group">
        <label htmlFor="project-image">
          Choose an image
        </label>

        <input
          id="project-image"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFileChange}
          disabled={uploading}
        />
      </div>

      {preview && (
        <div className="image-upload-preview">
          <img src={preview} alt="Selected project preview" />
        </div>
      )}

      {error && (
        <p className="error-message">{error}</p>
      )}

      {success && (
        <p className="success-message">{success}</p>
      )}

      <button
        type="button"
        className="primary-button"
        onClick={handleUpload}
        disabled={!image || uploading}
      >
        {uploading ? "Uploading..." : "Upload Image"}
      </button>
    </section>
  );
}