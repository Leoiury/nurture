import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { CHAVE_FOCO } from "@/lib/agenda/preferencias";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nurture",
  description: "Sistema gerencial da Nurture Terapias Integradas",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // O script abaixo pode marcar data-foco antes da hidratação.
      suppressHydrationWarning
    >
      <head>
        {/* Aplica o modo foco da agenda antes da primeira pintura, sem o cabeçalho "piscar". */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(location.pathname.indexOf("/agenda")===0&&localStorage.getItem(${JSON.stringify(CHAVE_FOCO)})==="1")document.documentElement.setAttribute("data-foco","")}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
