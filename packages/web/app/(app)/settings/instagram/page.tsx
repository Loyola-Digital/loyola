import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Instagram } from "lucide-react";

export default function InstagramSettingsPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Instagram className="h-5 w-5" />
          Meta / Instagram
        </CardTitle>
        <CardDescription>
          Gerencie suas contas de Instagram e access tokens aqui.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Configuração de contas Instagram será implementada na Story 3.3.2.
        </p>
      </CardContent>
    </Card>
  );
}
