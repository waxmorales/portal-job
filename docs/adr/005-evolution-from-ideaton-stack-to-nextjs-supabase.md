# ADR-005: Evolución Arquitectónica desde el Stack Conceptual del Ideatón a Next.js 16 + Supabase

* **Estado:** Aceptado (Arquitectura Blueprint)
* **Autor:** Max Clever Quintana Morales (Arquitecto Backend)

## Contexto
En el documento académico/concursal original de **PortalJob** para el Ideatón Por El Empleo Juvenil, el cronograma inicial referenció un stack tradicional conceptual basado en **Java (Backend) + HTML (Frontend) + Python + Heroku** para prototipado y despliegue.

Al pasar a la fase de diseño de arquitectura backend orientada a producción, escalabilidad nacional (Lima → Piura, Lambayeque, Arequipa → Nacional) y optimización del presupuesto tecnológico (`USD 35k–41k` desarrollo y `USD 13k–16.5k` infraestructura), se evaluó si mantener múltiples runtimes separados en PaaS tradicional era la mejor opción.

## Decisión
Consolidar la arquitectura del blueprint sobre **Next.js 16 (App Router) + Supabase (PostgreSQL + GoTrue Auth + Row Level Security) + Motor Determinista en TypeScript puro**:
1. **Seguridad por diseño en la base de datos:** Supabase/PostgreSQL aporta RLS nativo *deny-by-default* para cumplir la **Ley N.º 29733**, evitando reimplementar filtros multi-tenant manualmente en múltiples servicios Java/Python.
2. **Eliminación de fricción entre Backend y Frontend:** Next.js 16 App Router actúa como BFF tipado de extremo a extremo junto con `packages/simulation-engine` en TypeScript puro.
3. **Eficiencia de costos y latencia:** El modelo serverless y gestionado elimina servidores PaaS siempre encendidos en etapas tempranas y escala de forma elástica ante campañas en universidades y regiones.

## Consecuencias
* **Positivas:** Menor costo de infraestructura, menor superficie de ataque, tipado compartido entre contratos API y motor de simulación, y mayor velocidad de entrega del MVP.
* **Negativas / Mitigación:** Si en etapas posteriores de expansión se requirieran modelos pesados de ML/analítica predictiva en Python para *Ha.Socia.Job*, la frontera desacoplada de APIs permite añadir un microservicio Python específico sin reescribir la base de datos ni el BFF.
