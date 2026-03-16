import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function GeneralSettingsPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Configurações Gerais</CardTitle>
        <CardDescription>
          Configurações gerais da plataforma estarão disponíveis em breve.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Nenhuma configuração disponível no momento.
        </p>
      </CardContent>
    </Card>
  );
}
