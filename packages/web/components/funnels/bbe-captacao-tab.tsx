"use client";

export function BbeCaptacaoTab() {
  return (
    <div className="rounded-md border overflow-hidden bg-background">
      <iframe
        src="/bbe/dashboard.html"
        title="BBE - Painel de Captacao"
        className="w-full"
        style={{ height: "calc(100vh - 200px)", minHeight: 800, border: 0 }}
      />
    </div>
  );
}
