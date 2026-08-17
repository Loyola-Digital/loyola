import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  // "/entrar" decide a primeira tela (PDI ou Minds). Vai na prop, e não só em
  // env var, pra valer em produção sem depender de configuração no painel.
  return <SignIn fallbackRedirectUrl="/entrar" />;
}
