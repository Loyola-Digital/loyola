"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, MeshTransmissionMaterial } from "@react-three/drei";
import * as THREE from "three";

function GoldRing({ radius, tube, speed }: { radius: number; tube: number; speed: number }) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame((_, delta) => {
    ref.current.rotation.x += delta * speed * 0.3;
    ref.current.rotation.y += delta * speed * 0.15;
  });
  return (
    <mesh ref={ref}>
      <torusGeometry args={[radius, tube, 48, 100]} />
      <meshStandardMaterial
        color="#d4a843"
        metalness={0.95}
        roughness={0.15}
        emissive="#d4a843"
        emissiveIntensity={0.08}
      />
    </mesh>
  );
}

function FloatingPanel({
  position,
  rotation,
  width,
  height,
  delay,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  width: number;
  height: number;
  delay: number;
}) {
  const ref = useRef<THREE.Mesh>(null!);
  return (
    <Float speed={1.5} rotationIntensity={0.15} floatIntensity={0.4} floatingRange={[-0.1, 0.1]}>
      <mesh ref={ref} position={position} rotation={rotation}>
        <planeGeometry args={[width, height]} />
        <meshPhysicalMaterial
          color="#1a1a1a"
          metalness={0.1}
          roughness={0.4}
          transparent
          opacity={0.65}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Gold border accent */}
      <mesh position={[position[0], position[1] + height / 2 - 0.02, position[2] + 0.01]} rotation={rotation}>
        <planeGeometry args={[width, 0.04]} />
        <meshStandardMaterial color="#d4a843" emissive="#d4a843" emissiveIntensity={0.3} />
      </mesh>
    </Float>
  );
}

function Particles({ count }: { count: number }) {
  const ref = useRef<THREE.Points>(null!);

  const [positions, sizes] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const sz = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 12;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 8;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 6;
      sz[i] = Math.random() * 0.02 + 0.005;
    }
    return [pos, sz];
  }, [count]);

  useFrame((_, delta) => {
    ref.current.rotation.y += delta * 0.02;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
      </bufferGeometry>
      <pointsMaterial size={0.025} color="#d4a843" transparent opacity={0.4} sizeAttenuation />
    </points>
  );
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} color="#fff5e0" />
      <pointLight position={[-3, 2, 2]} intensity={0.5} color="#d4a843" />

      {/* Central ring */}
      <GoldRing radius={1.8} tube={0.025} speed={0.4} />
      <GoldRing radius={2.4} tube={0.015} speed={-0.25} />

      {/* Dashboard panels floating in space */}
      <FloatingPanel position={[-1.6, 0.8, -0.5]} rotation={[0, 0.3, 0.05]} width={1.6} height={1} delay={0} />
      <FloatingPanel position={[1.8, -0.3, -0.8]} rotation={[0, -0.25, -0.03]} width={1.4} height={0.9} delay={0.5} />
      <FloatingPanel position={[0.2, -1.2, 0.3]} rotation={[0.05, 0.1, 0]} width={1.8} height={0.7} delay={1} />

      <Particles count={200} />
    </>
  );
}

export default function HeroScene() {
  return (
    <div className="absolute inset-0 -z-10 opacity-70">
      <Canvas
        camera={{ position: [0, 0, 5.5], fov: 45 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <Scene />
      </Canvas>
    </div>
  );
}
