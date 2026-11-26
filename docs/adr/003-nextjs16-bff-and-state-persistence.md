# ADR-003: Next.js 16 App Router como BFF y Persistencia de Estado por Checkpoints Versionados

* **Estado:** Aceptado (Arquitectura Blueprint)
* **Autor:** Max Clever Quintana Morales (Arquitecto Backend)

## Contexto
El simulador 3D en el navegador ejecuta sesiones interactivas que pueden durar entre 10 y 30 minutos. Los usuarios jóvenes suelen conectarse desde redes móviles o conexiones inestables, por lo que perder todo el progreso ante una recarga o micro-corte destruiría la retención.

## Decisión
Adoptar **Next.js 16 (App Router)** como Backend-for-Frontend (BFF) unificado y persistir el progreso mediante un modelo híbrido:
1. **Snapshot versionado (`simulation_sessions.state_snapshot` + `state_version`):** Permite restaurar instantáneamente la escena 3D al reanudar una sesión (`POST /sessions`) evitando race conditions mediante control optimista.
2. **Bitácora *append-only* (`session_events` con `idempotency_key`):** Registra cada acción crítica con timestamp y orden secuencial para que el servidor recalcule el puntaje real al finalizar (`POST /submit`).

## Consecuencias
* **Positivas:** Resiliencia ante recargas, reintentos de red seguros e imposibilidad de falsear resultados enviando solo un estado final prefabricado.
* **Negativas / Mitigación:** Incremento de escrituras intermedias en PostgreSQL durante sesiones activas; se mitiga enviando checkpoints por lotes (*batching*) cada N acciones o intervalo de segundos en lugar de un request HTTP por cada frame 3D.
