# ADR-001: Motor Determinista de Simulación en TypeScript Puro Separado de la IA

* **Estado:** Aceptado (Arquitectura Blueprint)
* **Autor:** Max Clever Quintana Morales (Arquitecto Backend)

## Contexto
PortalJob evalúa competencias prácticas en **Administración, Logística y Ventas**, además de habilidades blandas en **HaSociaJob** (comunicación efectiva, liderazgo, resolución de problemas y adaptabilidad). Los resultados respaldan **certificaciones laborales** y una **cartera de talento** consultada por empresas aliadas.

## Decisión
Separar estrictamente la evaluación cuantitativa de la retroalimentación generativa:
1. Toda puntuación (`final_score`), cumplimiento de SLA, detección de infracciones (`rule_violations`), otorgamiento de XP y elegibilidad de certificación se calcula en un **motor determinista en TypeScript puro** (`packages/simulation-engine`).
2. La Inteligencia Artificial consume *a posteriori* los resultados inmutables de `evaluation_results` para generar retroalimentación personalizada (fortalezas, áreas de mejora y acciones recomendadas).

## Consecuencias
* **Positivas:** Reproducibilidad auditable (`engineVersion + inputHash`), inmunidad contra *prompt injection*, latencia `< 5 ms` y control estricto del presupuesto de infraestructura.
* **Negativas / Mitigación:** Exige modelar rúbricas tipadas por cada vertical (`logistics`, `administration`, `sales`, `hasociajob`); se mitiga con contratos extensibles en `types.ts`.
