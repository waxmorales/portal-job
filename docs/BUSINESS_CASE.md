# Caso de Negocio, Alcance Regional y Proyección Financiera — PortalJob

Este documento reúne el respaldo de mercado, marco normativo peruano, despliegue territorial, alianzas propuestas y proyección presupuestal de **PortalJob** (propuesta reconocida como **Ganador Nacional en la Ideatón Por El Empleo Juvenil**).

> Para detalles técnicos de infraestructura, base de datos, seguridad RLS y motor determinista, revisar el [README técnico](../README.md) y [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 1. Problema y Cifras de Mercado (INEI — Lima Metropolitana)

Miles de jóvenes en el Perú enfrentan la barrera estructural de la primera experiencia: **sin experiencia no hay trabajo, y sin trabajo no hay experiencia**. Según cifras del **INEI** recopiladas en el planteamiento de PortalJob para Lima Metropolitana:

* **71,400 empleos perdidos** en jóvenes de **14 a 24 años** frente al periodo pre-pandemia.
* **130,000 jóvenes desempleados**, equivalente a una tasa de desempleo juvenil del **14.4%**.
* **84.9%** de los jóvenes menores de 25 años ocupados trabajan en condiciones de **informalidad**, sin beneficios sociales ni derechos laborales.

---

## 2. Marco Conceptual y Normativo

* **Empleo Decente y Ley de Empleo Juvenil (MTPE):** Simulaciones diseñadas sobre tareas reales de practicantes pagados para alinear competencias técnicas y transversales con la inserción formal.
* **Futuro del Trabajo y Uso de TICs:** Alfabetización digital, gestión de datos, redacción documental y uso de IA como retroalimentación formativa.
* **Seguridad y Salud en el Trabajo (SST):** Módulos dedicados a protocolos de prevención y seguridad laboral (EPP y cumplimiento operativo).
* **Protección de Datos Personales (Ley N.º 29733 — Perú):** Privacidad por diseño con cifrado, aislamiento por fila (RLS) y consentimiento explícito para intermediación laboral.

---

## 3. Plan de Despliegue Gradual en 3 Fases (Proyección 18 Meses)

Basado en la **Encuesta de Expectativa de Empleo de ManPowerGroup (inicios 2024)** para priorizar regiones con mayor dinamismo laboral:

```text
Fase 1 — Inicial (Meses 1–6):     Lima Metropolitana
                                  (Piloto B2C, métricas iniciales y calibración de rúbricas)
         │
         ▼
Fase 2 — Regional (Meses 7–12):   Piura (43%) • Lambayeque (30%) • Arequipa (29%)
                                  (Expansión a regiones prioritarias de demanda laboral)
         │
         ▼
Fase 3 — Nacional (Meses 13–18):  Cobertura Nacional Completa
                                  (Optimización continua y alianzas multi-sector)
```

---

## 4. Ecosistema de Alianzas y Sostenibilidad Propuesta

* **Sector Público y Cooperación Internacional:** Articulación propuesta con el **MTPE** (y programas como **Impulsa Perú**), la **Organización Internacional del Trabajo (OIT)** y redes como **Alliance 2015 / Ayuda en Acción**.
* **Empresas Aliadas Objetivo (Contenido Real & Cartera de Talento):** **Fundación Romero, ManPowerGroup, BCP, Telefónica, Promart e Interbank** para aportar tareas reales anonimizadas y acceder a talento pre-capacitado.
* **Red de Ex-Practicantes Colaboradores:** Participación de jóvenes con experiencia reciente en prácticas preprofesionales para retroalimentar escenarios reales.

---

## 5. Proyección Financiera Estimada

| Partida Presupuestal | Rango Estimado (USD) | Alcance Principal |
| :--- | :---: | :--- |
| **Desarrollo tecnológico** | USD 35,000 – 41,000 | Construcción MVP completo (Simuladores, *Ha.Socia.Job*, BFF Next.js, motor TS e IA). |
| **Infraestructura y soporte** | USD 13,000 – 16,500 | Supabase/PostgreSQL, hosting serverless, cifrado, monitoreo y soporte operativo. |
| **Recursos humanos** | USD 78,000 – 93,000 | Equipo multidisciplinario (Ingeniería, Diseño UX/3D, Pedagogía Laboral, Gestión). |
| **Promoción y alianzas** | USD 14,000 – 18,000 | Campañas en universidades, LinkedIn, redes sociales, ONGs y articulación empresarial. |
| **Mantenimiento y expansión** | USD 80,000 | Operación continua y escalamiento regional (Lima → Piura / Lambayeque / Arequipa → Nacional en 18 meses). |
| **Total Estimado** | **USD 220,000 – 250,500** | **Cobertura integral de desarrollo, seguridad, alianzas y expansión a 18 meses.** |
