"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { identidade } from "@/config/identidade";
import { menu } from "@/config/menu";

export function Cabecalho() {
  const caminho = usePathname();
  return (
    <header
      className="sticky top-0 z-10 text-white shadow-md"
      style={{
        background: "var(--cor-principal)",
        borderBottom: "3px solid var(--cor-detalhe)",
      }}
    >
      <Link href="/" className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        {identidade.logo ? (
          <Image
            src={identidade.logo}
            alt={`Logo ${identidade.nome}`}
            width={48}
            height={48}
            priority
            className="h-12 w-12 rounded-full bg-white shadow"
          />
        ) : null}
        <span className="fonte-titulo text-xl font-bold tracking-wide">{identidade.nome}</span>
      </Link>
      <nav className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-2 pb-2">
        {menu.map((item) => {
          const ativo = caminho === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${
                ativo ? "bg-white" : "hover:bg-white/15"
              }`}
              style={ativo ? { color: "var(--cor-principal)" } : undefined}
            >
              {item.rotulo}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
