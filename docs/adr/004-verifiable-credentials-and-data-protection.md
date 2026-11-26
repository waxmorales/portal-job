# ADR-004: Certificación Laboral Verificable y Protección de Datos Personales

* **Estado:** Aceptado (Arquitectura Blueprint)
* **Autor:** Max Clever Quintana Morales (Arquitecto Backend)

## Contexto
Uno de los pilares de PortalJob es emitir certificaciones laborales con potencial de co-aval junto a entidades públicas (ej. MTPE) y empresas aliadas, además de operar una cartera de talento capacitado a nivel nacional (Lima, Arequipa, Piura). Esto exige dos garantías simultáneas:
1. Que cualquier empleador pueda verificar la autenticidad de un certificado sin falsificaciones.
2. Que la información personal y los intentos de práctica de los jóvenes estén protegidos bajo estándares estrictos de ciberseguridad y privacidad (Ley N.º 29733 — Protección de Datos Personales en Perú).

## Decisión
1. **Ledger de Certificados Ligado a Evaluaciones Deterministas:** Crear la tabla `certificates` vinculada con clave única a `evaluation_results` (`passed = true`), generando en el servidor un `verification_code` único e inmutable para el cliente.
2. **Verificación Mínima sin Exposición Masiva:** Exponer la función `SECURITY DEFINER` `verify_certificate(code)` que responde únicamente al código exacto consultado, evitando enumeración o scraping de perfiles juveniles.
3. **Consentimiento Explícito para Intermediación (`talent_opt_ins`):** Las consultas B2B sobre la cartera de talento quedan bloqueadas por RLS salvo autorización explícita y revocable del joven.

## Consecuencias
* **Positivas:** Confianza institucional para modelos de co-certificación, prevención de fraude en credenciales y cumplimiento de privacidad por diseño (*Privacy by Design*).
* **Negativas / Mitigación:** Los candidatos deben otorgar *opt-in* explícito para aparecer ante nuevas empresas aliadas; se mitiga integrando un flujo claro de consentimiento al aprobar una ruta formativa.
