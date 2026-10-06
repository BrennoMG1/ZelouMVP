import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zelou! | Cuidado que acolhe",
  description: "Conexões seguras entre famílias e cuidadores profissionais.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
