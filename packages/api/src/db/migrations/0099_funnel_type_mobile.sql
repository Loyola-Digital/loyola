-- Tipo de funil "mobile" (app mobile — RevenueCat + Meta, dashboard Lyrio).
-- Aditivo e idempotente. O deploy aplica isso sozinho via drizzle-kit push no
-- boot (server.ts); este arquivo é registro / aplicação manual opcional.
ALTER TYPE "funnel_type" ADD VALUE IF NOT EXISTS 'mobile';
