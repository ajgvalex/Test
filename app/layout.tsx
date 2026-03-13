import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Payroll App",
  description: "Payroll management application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
