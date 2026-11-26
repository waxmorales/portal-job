# ADR-002: Row Level Security (RLS) en PostgreSQL como Frontera de Seguridad Multi-Tenant

* **Estado:** Aceptado (Arquitectura Blueprint)
* **Autor:** Max Clever Quintana Morales (Arquitecto Backend)

## Contexto
Portal Job maneja datos de dos tipos de usuarios con intereses sensibles y opuestos si no se aíslan correctamente:
1. Candidatos jóvenes (datos personales, intentos fallidos, progreso).
2. Empresas aliadas (retos corporativos privados y filtros de contratación).

Además, los puntos de experiencia (`XP`) y puntajes determinan la elegibilidad para oportunidades laborales, por lo que son un objetivo obvio de manipulación si el cliente pudiera escribir directamente en tablas de resultados.

## Decisión
Implementar **Row Level Security (RLS)** en modo *deny-by-default* en todas las tablas de Supabase/PostgreSQL:
1. El acceso B2B a métricas de candidatos queda bloqueado a nivel de fila salvo que exista registro vigente en `talent_opt_ins` (`consent_status = 'granted'`).
2. Las tablas `evaluation_results` y `candidate_skill_progress` bloquean `INSERT`/`UPDATE` desde el rol `authenticated` del cliente; solo el BFF del servidor (tras ejecutar el motor determinista) muta esos registros mediante `service_role`.

## Consecuencias
* **Positivas:** Incluso si un componente frontend o endpoint tuviera un error de filtrado, PostgreSQL impide fugas entre tenants o alteración directa de puntajes.
* **Negativas / Mitigación:** Las consultas complejas con múltiples joins requieren atención en índices para evitar degradación de rendimiento por evaluación de políticas RLS; se mitiga con índices compuestos dedicados y funciones `SECURITY DEFINER` con `search_path` fijado.
