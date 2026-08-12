import * as React from "react";
import { cn } from "@/lib/utils";

export interface ImageDropZoneProps extends React.HTMLAttributes<HTMLDivElement> {
  accept?: string;
  onFiles?: (files: File[]) => void;
  disabled?: boolean;
}

function matchesAccept(file: File, acceptStr: string): boolean {
  if (!acceptStr) return true;
  const patterns = acceptStr
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (patterns.length === 0) return true;
  return patterns.some((pattern) => {
    if (pattern.endsWith("/*")) {
      const baseType = pattern.slice(0, -2);
      return file.type.startsWith(baseType + "/");
    }
    if (pattern.startsWith(".")) {
      return file.name.toLowerCase().endsWith(pattern.toLowerCase());
    }
    return file.type === pattern;
  });
}

const ImageDropZone = React.forwardRef<HTMLDivElement, ImageDropZoneProps>(
  (
    {
      className,
      accept = "image/*",
      onFiles,
      disabled = false,
      onClick,
      onKeyDown,
      onDragOver,
      onDragLeave,
      onDrop,
      ...props
    },
    ref
  ) => {
    const [isDragOver, setIsDragOver] = React.useState(false);
    const [rejectedFiles, setRejectedFiles] = React.useState<File[]>([]);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const inputId = React.useId();

    const processFiles = React.useCallback(
      (fileList: FileList | File[]) => {
        const files = Array.from(fileList);
        const accepted: File[] = [];
        const rejected: File[] = [];

        files.forEach((file) => {
          if (matchesAccept(file, accept)) {
            accepted.push(file);
          } else {
            rejected.push(file);
          }
        });

        setRejectedFiles(rejected);
        if (accepted.length > 0) {
          onFiles?.(accepted);
        }
      },
      [accept, onFiles]
    );

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
      setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (disabled) return;
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        processFiles(e.dataTransfer.files);
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        processFiles(e.target.files);
      }
      // Reset so selecting the same file again still fires a change event.
      e.target.value = "";
    };

    // The programmatic inputRef.current.click() in handleClick dispatches a
    // native click event that bubbles up to this div, which would otherwise
    // invoke the external onClick a second time. Stop it at the source so a
    // single user click on the drop zone results in exactly one external
    // onClick call (matches the semantics of a native <label>/<input> pair,
    // where the hidden input's click is an implementation detail).
    const handleInputClick = (e: React.MouseEvent<HTMLInputElement>) => {
      e.stopPropagation();
    };

    const handleClick = (e?: React.MouseEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (e && e.target === inputRef.current) return;
      inputRef.current?.click();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        handleClick();
      }
    };

    const composeHandlers =
      <E extends React.SyntheticEvent>(
        internal: (e: E) => void,
        external?: (e: E) => void
      ) =>
      (e: E) => {
        internal(e);
        // Disabled controls must not surface caller-provided side effects
        // (matches native disabled input/button semantics).
        if (disabled) return;
        external?.(e);
      };

    return (
      <div
        ref={ref}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-labelledby={`${inputId}-label`}
        onClick={composeHandlers(handleClick, onClick)}
        onKeyDown={composeHandlers(handleKeyDown, onKeyDown)}
        onDragOver={composeHandlers(handleDragOver, onDragOver)}
        onDragLeave={composeHandlers(handleDragLeave, onDragLeave)}
        onDrop={composeHandlers(handleDrop, onDrop)}
        className={cn(
          "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          isDragOver
            ? "border-primary bg-primary/10"
            : "border-muted-foreground/25 hover:border-primary/50",
          disabled && "cursor-not-allowed opacity-50 hover:border-muted-foreground/25",
          className
        )}
        {...props}
      >
        <span id={`${inputId}-label`} className="sr-only">
          Upload files
        </span>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          tabIndex={-1}
          className="sr-only hidden"
          onChange={handleChange}
          onClick={handleInputClick}
          disabled={disabled}
          data-testid="image-drop-zone-input"
        />
        <div className="text-center">
          <p className="text-sm font-medium">
            Drag and drop images here, or click to select
          </p>
          {accept && (
            <p className="mt-1 text-xs text-muted-foreground">
              Accepted format: {accept}
            </p>
          )}
        </div>
        {rejectedFiles.length > 0 && (
          <div
            className="mt-4 w-full rounded border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive"
            data-testid="rejected-files"
          >
            <p className="font-semibold">Rejected files:</p>
            <ul className="mt-1 list-inside list-disc">
              {rejectedFiles.map((file, idx) => (
                <li key={idx}>
                  {file.name} ({file.type || "unknown type"})
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }
);
ImageDropZone.displayName = "ImageDropZone";

export { ImageDropZone };
