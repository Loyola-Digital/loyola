import type { NextConfig } from "next";
import { join } from "path";

/**
 * O build estava em ~6 min no deploy. Medido localmente (a frio), o tempo se
 * dividia assim: compilação 85s, lint + typecheck 54s, build traces 31s,
 * páginas 10s. As três primeiras fatias são atacadas aqui.
 */
const nextConfig: NextConfig = {
  // Necessário para o Dockerfile do web (copia .next/standalone).
  output: "standalone",
  outputFileTracingRoot: join(__dirname, "../../"),
  transpilePackages: ["@loyola-x/shared"],

  /**
   * O rastreamento de arquivos varre o monorepo inteiro — 1,4 GB de node_modules
   * — para descobrir o que entra no standalone. A maior parte é dependência da
   * API e do pipeline de vídeo, que o site nunca importa: só `googleapis` tem
   * 194 MB. Excluir o que não é do site corta a maior parte dessa varredura.
   *
   * Se algum dia o site passar a usar uma destas, o build quebra na hora de
   * rodar — não silenciosamente — porque o arquivo simplesmente não vai estar lá.
   */
  outputFileTracingExcludes: {
    "*": [
      "node_modules/.pnpm/googleapis*/**",
      "node_modules/.pnpm/google-auth-library*/**",
      "node_modules/.pnpm/@ffmpeg*/**",
      "node_modules/.pnpm/fluent-ffmpeg*/**",
      "node_modules/.pnpm/drizzle-kit*/**",
      "node_modules/.pnpm/fastify*/**",
      "node_modules/.pnpm/typescript*/**",
      "node_modules/.pnpm/esbuild*/**",
      "node_modules/.pnpm/@esbuild*/**",
      "node_modules/.pnpm/@swc*/**",
      "node_modules/.pnpm/vitest*/**",
      "node_modules/.pnpm/@vitest*/**",
      "node_modules/.pnpm/eslint*/**",
      "node_modules/.pnpm/@typescript-eslint*/**",
      "packages/api/**",
      "packages/video/**",
      "packages/mcp/**",
      "**/*.map",
    ],
  },

  /**
   * Lint e typecheck saem do build e passam a rodar no CI (.github/workflows/
   * ci.yml), em paralelo entre si e com o deploy.
   *
   * Não é abrir mão da verificação: é parar de fazê-la DUAS vezes em série. O
   * mesmo commit é checado no PR, e um erro de tipo aparece lá em ~1 min em vez
   * de segurar o deploy inteiro por 54s toda vez que alguém publica.
   */
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  experimental: {
    /**
     * Reescreve `import { X } from "lib"` para o caminho do módulo específico.
     * Vale muito aqui: 212 arquivos importam de `lucide-react`, e sem isto cada
     * um puxa o índice inteiro do pacote para o compilador resolver.
     */
    optimizePackageImports: ["lucide-react", "recharts", "date-fns", "@radix-ui/react-icons"],
  },

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.cdninstagram.com" },
      { protocol: "https", hostname: "**.fbcdn.net" },
    ],
  },

  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3001/api/:path*",
      },
    ];
  },
};

export default nextConfig;
