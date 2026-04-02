import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  spring,
} from "remotion";
import { colors, fullScreen, glassMorphism } from "../styles";
import { SidebarMock } from "../components/SidebarMock";
import { TypeWriter } from "../components/TypeWriter";

const messages = [
  {
    role: "user" as const,
    text: "Hormozi, crie uma oferta irresistível para nosso produto SaaS de R$197/mês",
    delay: 30,
  },
  {
    role: "assistant" as const,
    text: "Vou aplicar o framework Grand Slam Offer aqui. Primeiro, precisamos entender o dream outcome do seu cliente. Para um SaaS de R$197/mês, a chave é stackar o valor percebido. Aqui vai:\n\n🎯 **Oferta Grand Slam:**\n\n1. **Core:** Acesso completo à plataforma (R$197/mês)\n2. **Bonus 1:** Setup personalizado 1:1 (valor: R$2.000)\n3. **Bonus 2:** Templates prontos do setor (valor: R$997)\n4. **Bonus 3:** Comunidade VIP + calls semanais (valor: R$497/mês)\n5. **Garantia:** 30 dias ou seu dinheiro de volta\n\n💰 **Valor total stackado:** R$3.691 por apenas R$197/mês\n\nIsso cria uma relação valor/preço de ~18:1. O segredo é tornar tão bom que a pessoa se sente burra dizendo não.",
    delay: 100,
  },
];

export const ChatScene: React.FC = () => {
  const frame = useCurrentFrame();

  const exitOpacity = interpolate(frame, [380, 420], [1, 0], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        ...fullScreen,
        flexDirection: "row",
        alignItems: "stretch",
        opacity: exitOpacity,
      }}
    >
      <SidebarMock activeItem="chat" />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          height: "100%",
        }}
      >
        {/* Chat header */}
        <div
          style={{
            padding: "16px 32px",
            borderBottom: `1px solid ${colors.border}`,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              backgroundColor: colors.brand,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              fontWeight: 700,
              color: "#000",
            }}
          >
            AH
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: colors.text }}>
              Alex Hormozi
            </div>
            <div style={{ fontSize: 12, color: colors.green }}>
              ● Online — Growth & Offers
            </div>
          </div>
        </div>

        {/* Messages area */}
        <div
          style={{
            flex: 1,
            padding: "32px 48px",
            display: "flex",
            flexDirection: "column",
            gap: 24,
            overflow: "hidden",
          }}
        >
          {messages.map((msg, i) => {
            const msgOpacity = interpolate(
              frame - msg.delay,
              [0, 20],
              [0, 1],
              { extrapolateRight: "clamp", extrapolateLeft: "clamp" }
            );
            const msgY = spring({
              frame: Math.max(0, frame - msg.delay),
              fps: 60,
              config: { damping: 12, stiffness: 100, mass: 0.5 },
            });
            const translateY = interpolate(msgY, [0, 1], [30, 0]);

            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent:
                    msg.role === "user" ? "flex-end" : "flex-start",
                  opacity: msgOpacity,
                  transform: `translateY(${translateY}px)`,
                }}
              >
                <div
                  style={{
                    maxWidth: msg.role === "assistant" ? 720 : 520,
                    padding: "16px 20px",
                    borderRadius: 16,
                    backgroundColor:
                      msg.role === "user"
                        ? `${colors.brand}20`
                        : colors.bgCard,
                    border: `1px solid ${
                      msg.role === "user" ? `${colors.brand}40` : colors.border
                    }`,
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: colors.text,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {msg.role === "assistant" ? (
                    <TypeWriter
                      text={msg.text}
                      speed={1}
                      delay={msg.delay + 30}
                    />
                  ) : (
                    msg.text
                  )}
                </div>
              </div>
            );
          })}

          {/* Thinking indicator */}
          {frame > 60 && frame < 130 && (
            <div
              style={{
                display: "flex",
                gap: 6,
                padding: "12px 16px",
                borderRadius: 12,
                backgroundColor: colors.bgCard,
                border: `1px solid ${colors.border}`,
                alignSelf: "flex-start",
                alignItems: "center",
              }}
            >
              {[0, 1, 2].map((dot) => {
                const dotOpacity = interpolate(
                  Math.sin((frame - 60 + dot * 10) * 0.15),
                  [-1, 1],
                  [0.3, 1]
                );
                return (
                  <div
                    key={dot}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: colors.brand,
                      opacity: dotOpacity,
                    }}
                  />
                );
              })}
              <span
                style={{
                  fontSize: 12,
                  color: colors.textMuted,
                  marginLeft: 8,
                }}
              >
                Hormozi está pensando...
              </span>
            </div>
          )}
        </div>

        {/* Chat input */}
        <div
          style={{
            padding: "16px 48px 24px",
            borderTop: `1px solid ${colors.border}`,
          }}
        >
          <div
            style={{
              ...glassMorphism,
              padding: "14px 20px",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span style={{ fontSize: 14, color: colors.textMuted, flex: 1 }}>
              Envie uma mensagem para Hormozi...
            </span>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: colors.brand,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
              }}
            >
              ➤
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
