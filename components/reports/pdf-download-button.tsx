"use client";

import { useState, useEffect, type ReactElement } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PDFDownloadButtonProps {
  /** A function that returns the PDF document element (only called client-side). */
  getDocument: () => ReactElement;
  fileName: string;
  label?: string;
  variant?: "default" | "outline";
  size?: "default" | "sm" | "icon";
}

export function PDFDownloadButton({
  getDocument,
  fileName,
  label,
  variant = "outline",
  size = "sm",
}: PDFDownloadButtonProps) {
  const [generating, setGenerating] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant={variant} size={size} disabled>
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    );
  }

  async function handleClick() {
    setGenerating(true);
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const doc = getDocument();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blob = await pdf(doc as any).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Button variant={variant} size={size} onClick={handleClick} disabled={generating}>
      {generating ? (
        <Loader2 className={`h-4 w-4 animate-spin ${label ? "mr-2" : ""}`} />
      ) : (
        <Download className={`h-4 w-4 ${label ? "mr-2" : ""}`} />
      )}
      {label}
    </Button>
  );
}
