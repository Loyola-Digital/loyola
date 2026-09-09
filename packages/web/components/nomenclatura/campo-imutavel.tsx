"use client";

/**
 * Story 47.2 — o campo de código/slug/sigla/valor.
 *
 * Travado quando o registro está usado em campanha (spec § 5) — com o texto
 * literal "Usado em N campanha(s). Para mudar o significado, crie um código
 * novo." — ou quando é a sigla do expert (imutável desde a criação). Enquanto
 * editável, mostra ao vivo o que o servidor vai gravar, pela MESMA função de
 * normalização (`shared`), e acusa `_` antes de enviar.
 */

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { previaDeNormalizacao, textoDeCampoUsado } from "@/lib/utils/nomenclatura-cascata";
import type { TipoDeCodigo } from "@loyola-x/shared/src/nomenclatura-codigos";

export function CampoImutavel(props: {
  id: string;
  label: string;
  valor: string;
  onChange: (v: string) => void;
  tipo: TipoDeCodigo;
  usadoEm?: number;
  travadoPorque?: string;
  placeholder?: string;
  ajuda?: string;
  autoFocus?: boolean;
}) {
  const { id, label, valor, onChange, tipo, usadoEm = 0, travadoPorque, placeholder, ajuda, autoFocus } = props;
  const travado = Boolean(travadoPorque) || usadoEm > 0;
  const motivo = travadoPorque ?? (usadoEm > 0 ? textoDeCampoUsado(usadoEm) : null);
  const previa = travado ? null : previaDeNormalizacao(valor, tipo);
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        disabled={travado}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="font-mono"
        aria-invalid={previa ? !previa.ok : undefined}
      />
      {motivo ? <p className="text-xs text-muted-foreground">{motivo}</p> : null}
      {!motivo && previa ? (
        previa.ok ? (
          previa.valor !== valor ? (
            <p className="text-xs text-muted-foreground">
              vai gravar <span className="font-mono text-foreground">{previa.valor}</span>
            </p>
          ) : null
        ) : (
          <p className="text-xs text-destructive">{previa.motivo}</p>
        )
      ) : null}
      {!motivo && !previa && ajuda ? <p className="text-xs text-muted-foreground">{ajuda}</p> : null}
    </div>
  );
}
