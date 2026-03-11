# La Maison du Regard — Ligne Directrice Projet

> Systeme de reservation custom + dashboard admin pour La Maison du Regard, institut de beaute a Corenc (Celia, praticienne unique). Remplace Iara Beauty.

**Proprietaire/Dev** : Nino — prefere le francais, reponses concises.

---

## Architecture

| Composant | Tech | Port | Dossier | URL dev |
|-----------|------|------|---------|---------|
| **Site vitrine** | HTML/CSS/JS (GSAP) | — | `/` (racine) | `http://localhost:5500` |
| **Backend API** | Node.js 18+ / Express 4 / PostgreSQL | 3000 | `/backend` | `http://localhost:3000/api` |
| **Dashboard admin** | React 19 + Vite 6 + React Router 7 | 5175 | `/dashboard` | `http://localhost:5175` |

**Infra** : Railway (backend + BDD) + Cloudflare Pages (site + dashboard)

---

## Stack technique

### Backend (Node.js/Express)

| Dependance | Version | Role |
|------------|---------|------|
| express | ^4.21.2 | Framework web |
| pg | ^8.13.1 | Client PostgreSQL |
| bcrypt | ^6.0.0 | Hash mots de passe (12 rounds) |
| jsonwebtoken | ^9.0.2 | Auth JWT |
| node-cron | ^3.0.3 | Taches planifiees |
| express-rate-limit | ^7.5.0 | Rate limiting |
| express-validator | ^7.2.1 | Validation input |
| cors | ^2.8.5 | Cross-origin |
| helmet | ^8.0.0 | Headers securite |
| winston | ^3.17.0 | Logging |
| cookie-parser | ^1.4.7 | Cookies httpOnly |
| dotenv | ^16.4.7 | Variables d'env |
| uuid | ^11.1.0 | Generation UUID |

### Dashboard (React)

| Dependance | Version | Role |
|------------|---------|------|
| react | ^19.0.0 | UI framework |
| react-dom | ^19.0.0 | DOM rendering |
| react-router-dom | ^7.1.0 | Routing (HashRouter) |
| date-fns | ^4.1.0 | Manipulation dates |
| vite | ^6.0.0 | Build tool |
| @vitejs/plugin-react | ^4.3.0 | JSX support |

### Services externes

| Service | Usage | Config |
|---------|-------|--------|
| **Brevo** | Email transactionnel + SMS | API REST, sender `MAISONDUREG` |
| **Railway** | Hebergement backend + PostgreSQL | Nouveau projet, meme compte BarberClub |
| **Cloudflare Pages** | Site + dashboard | Deja en place pour le site |
| **Google Business** | Avis clients | Via `GOOGLE_REVIEW_URL` |

---

## Structure des fichiers

```
La maison du regard/
|-- index.html                     # Page d'accueil (hero video, presentation)
|-- styles.css                     # Design system global (2088 lignes)
|-- script.js                      # Interactions (GSAP, tabs, lightbox, map)
|-- _redirects                     # Cloudflare Pages redirects
|-- _headers                       # Cache + securite headers
|-- CLAUDE.md                      # Ce fichier
|
|-- soins/
|   |-- index.html                 # Hub prestations (3 onglets categories)
|   |-- sourcils/index.html        # Detail sourcils
|   |-- maquillage-permanent/index.html  # Detail maquillage permanent
|   +-- extensions-cils/index.html       # Detail cils
|
|-- reserver/index.html            # Flow reservation 3 etapes (NEW)
|-- mon-rdv/index.html             # Consulter/annuler/modifier RDV (NEW)
|-- reset-password/index.html      # Reset mot de passe client (NEW)
|
|-- salon/index.html               # Presentation salon + Celia
|-- galerie/index.html             # Photos
|-- avis/index.html                # Avis Google
|-- faq/index.html                 # FAQ
|-- mentions-legales/index.html    # Mentions legales
|
|-- assets/
|   |-- images/                    # Photos salon, Celia, prestations
|   +-- video/                     # Video hero
|
|-- backend/
|   |-- .env                       # Secrets (NE PAS COMMIT)
|   |-- .env.example               # Template variables env
|   |-- package.json
|   |-- database/
|   |   |-- schema.sql             # 10 tables
|   |   +-- seed.sql               # Celia + 22 services + horaires + automation
|   +-- src/
|       |-- index.js               # Entry (routes, CORS, helmet, crons, advisory locks)
|       |-- constants.js           # Constantes metier
|       |-- config/
|       |   |-- env.js             # Variables env (pas de multi-salon)
|       |   +-- database.js        # Pool pg, type parsers DATE/TIME
|       |-- middleware/
|       |   |-- auth.js            # JWT (practitioner 7j, client 15m, httpOnly cookie mdr_refresh_token)
|       |   |-- rateLimiter.js     # public 60/min, auth 10/15min, admin 200/min
|       |   +-- validate.js        # express-validator wrapper
|       |-- routes/
|       |   |-- health.js          # GET /api/health + /api/health/ping
|       |   |-- auth.js            # login, register, refresh, logout, forgot/reset, claim-account
|       |   |-- bookings.js        # services, availability, CRUD bookings, ICS
|       |   |-- client.js          # profil, mes RDV
|       |   +-- admin/
|       |       |-- bookings.js    # Planning, history, create, reschedule, cancel, status
|       |       |-- services.js    # CRUD prestations + category
|       |       |-- schedule.js    # Horaires hebdo + overrides (pas de barbers.js)
|       |       |-- clients.js     # Liste, search, detail, notes, RGPD delete
|       |       |-- blockedSlots.js # Pauses, fermetures
|       |       |-- analytics.js   # KPIs, revenue, stats services
|       |       |-- notifications.js # Logs, stats, purge
|       |       |-- sms.js         # Envoi SMS bulk
|       |       |-- automation.js  # review_sms toggle
|       |       +-- systemHealth.js # DB health, crons, memory
|       |-- services/
|       |   |-- availability.js    # Calcul creneaux (15min public, 5min admin, pas de barber_id)
|       |   |-- booking.js         # Creation atomique, advisory lock sur date
|       |   +-- notification.js    # Brevo email+SMS, templates peach/gold, circuit breaker
|       |-- cron/
|       |   |-- reminders.js       # SMS rappel J-1 (18h)
|       |   |-- retryNotifications.js # processQueue + cleanup notifs + cleanup tokens
|       |   +-- automationTriggers.js # Auto-complete + review SMS
|       +-- utils/
|           |-- errors.js          # ApiError (400/401/403/404/409/429/500)
|           |-- logger.js          # Winston
|           +-- ics.js             # Generateur .ics
|
+-- dashboard/
    |-- package.json
    |-- vite.config.js             # Port 5175, ES2018
    |-- index.html                 # Entry HTML
    +-- src/
        |-- App.jsx                # Routes (HashRouter, lazy loading)
        |-- api.js                 # Client API (auto-refresh JWT, mdr_access_token)
        |-- auth.jsx               # AuthContext (mdr_user, mdr_access_token)
        |-- main.jsx               # React root
        |-- index.css              # Theme clair peach/gold (~1250 lignes)
        |-- components/
        |   |-- Layout.jsx         # Sidebar 240px + bottom nav mobile
        |   +-- ErrorBoundary.jsx  # Catch errors React
        |-- hooks/
        |   +-- useMobile.js       # Breakpoint 1024px
        +-- pages/
            |-- Login.jsx          # Auth praticienne
            |-- Planning.jsx       # Grille 1 colonne 8h-20h, day/week, auto-refresh 30s
            |-- Services.jsx       # CRUD prestations par categorie
            |-- Schedule.jsx       # Horaires hebdo + overrides (NEW vs BarberClub)
            |-- Clients.jsx        # Liste paginee, search
            |-- ClientDetail.jsx   # Fiche + historique + notes + RGPD
            |-- History.jsx        # Historique filtrable
            |-- Messages.jsx       # SMS + notifications + automation
            |-- Analytics.jsx      # KPIs basiques
            +-- SystemHealth.jsx   # Status systeme
```

---

## Base de donnees — 10 tables

| Table | Description | Cles importantes |
|-------|-------------|------------------|
| **practitioner** | Celia (1 row) | UUID, email UNIQUE, password_hash, is_active, failed_login_attempts, locked_until |
| **services** | 22 prestations | UUID, category (sourcils/maquillage_permanent/cils), price (centimes!), duration (min), color, is_popular, sort_order |
| **schedules** | Horaires hebdo | day_of_week (0=Lundi!), start/end_time, is_working, UNIQUE(day_of_week) |
| **schedule_overrides** | Vacances/exceptions | date UNIQUE, is_day_off, start/end_time, reason |
| **clients** | Profils clients | UUID, phone UNIQUE, has_account, review_requested, notes |
| **bookings** | Reservations | UUID, client_id, service_id, date, start_time, end_time, status, cancel_token, rescheduled |
| **blocked_slots** | Creneaux bloques | type (break/personal/closed), reason |
| **notification_queue** | File d'attente notifs | type, channel (email/sms), status (pending/sent/failed), attempts, next_retry_at |
| **refresh_tokens** | Sessions JWT | user_type (practitioner/client), token UNIQUE, expires_at |
| **automation_triggers** | Regles auto | type UNIQUE (review_sms), is_active, config JSONB |

### Contraintes critiques
- `bookings_no_overlap` : UNIQUE (date, start_time) WHERE status != 'cancelled' AND deleted_at IS NULL
- Booking statuses : `confirmed`, `completed`, `no_show`, `cancelled`
- Advisory locks PostgreSQL pour serialiser bookings et crons
- **Pas de barber_id** — Celia est seule, le slot est unique par (date, start_time)
- **Pas de salon_id** — un seul salon

### Differences vs BarberClub (22 tables → 10)
Tables supprimees : barbers, barber_services, guest_assignments, client_salons, salons, payments, register_closings, products, product_sales, gift_cards, waitlist, campaigns

---

## 22 services seedes

### Sourcils (6)
| Service | Duree | Prix |
|---------|-------|------|
| Restructuration sourcils | 30min | 20e |
| Teinture sourcils | 20min | 15e |
| Rehaussement de sourcils | 45min | 40e |
| Restructuration + Teinture | 45min | 30e |
| Brow Lift + Teinture | 60min | 50e |
| Brow Lift + Restructuration + Teinture | 75min | 55e |

### Maquillage Permanent (11)
| Service | Duree | Prix |
|---------|-------|------|
| Microblading sourcils | 120min | 250e |
| Microshading sourcils | 120min | 250e |
| Combo Microblading + Microshading | 150min | 300e |
| Retouche microblading (< 2 mois) | 90min | 0e |
| Retouche microblading (2-12 mois) | 90min | 100e |
| Retouche microblading (> 12 mois) | 120min | 150e |
| Candy Lips | 150min | 300e |
| Retouche Candy Lips (< 2 mois) | 90min | 0e |
| Retouche Candy Lips (2-12 mois) | 90min | 100e |
| Retouche Candy Lips (> 12 mois) | 120min | 150e |
| Eye-liner maquillage permanent | 120min | 200e |

### Cils (5)
| Service | Duree | Prix |
|---------|-------|------|
| Rehaussement de cils | 60min | 50e |
| Rehaussement + Teinture cils | 75min | 55e |
| Teinture cils | 20min | 15e |
| Extension cils classique | 120min | 80e |
| Remplissage extensions (< 3 sem.) | 60min | 45e |

---

## Constantes metier (constants.js)

```
BCRYPT_ROUNDS: 12
MAX_LOGIN_ATTEMPTS: 5
LOCKOUT_MINUTES: 15
RESET_TOKEN_EXPIRY_MS: 3600000 (1h)
MAX_BOOKING_ADVANCE_MONTHS: 6
CANCELLATION_DEADLINE_HOURS: 24 (vs 12h BarberClub — prestations plus longues)
MIN_BOOKING_LEAD_MINUTES: 5
SLOT_INTERVAL_PUBLIC: 15 min (vs 30min BarberClub)
SLOT_INTERVAL_ADMIN: 5 min
SCHEDULE_END: '20:00'
NOTIFICATION_RETRY_DELAYS: [5, 15, 60] min
NOTIFICATION_BATCH_SIZE: 10
NOTIFICATION_CLEANUP_DAYS: 30
BREVO_CIRCUIT_THRESHOLD: 3 failures -> cooldown 60s
```

---

## API — Endpoints

### Public (rate-limited 60/min)
```
GET  /api/health                    # Status + DB check
GET  /api/health/ping               # "pong"
POST /api/auth/login                # Login practitioner OU client
POST /api/auth/register             # Inscription client
POST /api/auth/refresh              # Rotation JWT (httpOnly cookie)
POST /api/auth/logout               # Supprime refresh token
POST /api/auth/forgot-password      # Email reset
POST /api/auth/reset-password       # Reset + auto-login
POST /api/auth/claim-account        # Guest -> compte
GET  /api/services                  # Catalogue (optional ?category)
GET  /api/availability              # Creneaux dispo (15min, ?service_id&date)
POST /api/bookings                  # Creer RDV
GET  /api/bookings/:id?token=       # Details via cancel_token
POST /api/bookings/:id/cancel       # Annuler (>24h)
POST /api/bookings/:id/reschedule   # Modifier (1x, >24h)
GET  /api/bookings/:id/ics?token=   # Telecharger .ics
GET  /r/avis                        # Redirect Google review
GET  /r/rdv/:id/:token              # Redirect mon-rdv
```

### Client authentifie
```
GET  /api/client/profile
PUT  /api/client/profile
GET  /api/client/bookings
```

### Admin (requireAuth + requirePractitioner + 200/min)
```
# Planning & Bookings
GET    /api/admin/bookings              # Planning day/week
GET    /api/admin/bookings/history      # Historique filtrable
POST   /api/admin/bookings              # Creation manuelle (5min intervals)
PUT    /api/admin/bookings/:id          # Modifier
POST   /api/admin/bookings/:id/reschedule # Reschedule (sans limite 24h)
POST   /api/admin/bookings/:id/cancel   # Cancel (sans limite 24h)
PATCH  /api/admin/bookings/:id/status   # completed/no_show/confirmed

# Services
GET    /api/admin/services
POST   /api/admin/services
PUT    /api/admin/services/:id
DELETE /api/admin/services/:id

# Horaires (pas de barber_id)
GET    /api/admin/schedule              # Horaires hebdo + overrides
PUT    /api/admin/schedule              # Modifier horaires
GET    /api/admin/schedule/overrides
POST   /api/admin/schedule/overrides
DELETE /api/admin/schedule/overrides/:id

# Clients
GET    /api/admin/clients               # Liste paginee, search
GET    /api/admin/clients/:id           # Detail + historique
PUT    /api/admin/clients/:id           # Modifier (notes)
DELETE /api/admin/clients/:id           # RGPD delete

# Blocked Slots
GET    /api/admin/blocked-slots
POST   /api/admin/blocked-slots
DELETE /api/admin/blocked-slots/:id

# Analytics
GET    /api/admin/analytics/dashboard   # KPIs globaux
GET    /api/admin/analytics/revenue     # Revenue par periode
GET    /api/admin/analytics/services    # Stats prestations

# Communication
POST   /api/admin/sms/send              # Envoyer SMS bulk
GET    /api/admin/notifications/logs
GET    /api/admin/notifications/stats
DELETE /api/admin/notifications/purge

# Automation
GET    /api/admin/automation
PUT    /api/admin/automation/:type

# Systeme
GET    /api/admin/system/status
```

---

## Brevo — Email + SMS

### Configuration
| Param | Valeur |
|-------|--------|
| Sender Email | `noreply@lamaisonduregard.fr` |
| Sender Name | `La Maison du Regard` |
| Sender SMS | `MAISONDUREG` |
| API | REST Brevo via `BREVO_API_KEY` |

### Templates email (HTML inline, branding peach/gold)
| Template | Declencheur | Contenu |
|----------|-------------|---------|
| Confirmation | Creation booking | Recap + Google Maps + lien gerer RDV |
| Annulation | Annulation | Confirmation + bouton reprendre RDV |
| Reschedule | Modification | Ancien/nouveau creneau |
| Reset password | forgot-password | Lien reset (1h) |

### Design tokens emails
```
BG: #FFF5F0 | CARD: #FFFFFF | BORDER: #F0E0D6
TEXT: #3D2C2E | SECONDARY: #6B5558 | MUTED: #9B8A8D
ACCENT: #C9A96E (gold) | CTA: gold fond + texte blanc
Font: Montserrat
```

### SMS actifs
| Type | Declencheur | Contenu |
|------|-------------|---------|
| Rappel J-1 | Cron 18h | `La Maison du Regard - Rappel : votre RDV...` |
| Review Google | 60min post-completed (1x/client) | `Merci ! Laissez un avis...` |

---

## Cron jobs (production uniquement)

| Frequence | Job | Description |
|-----------|-----|-------------|
| */2 min | processQueue | Retry notifications (backoff 5->15->60 min, max 3) |
| */10 min | automationTriggers | Auto-complete + review SMS |
| 18h daily | queueReminders | SMS rappels pour demain |
| 03h00 | cleanupNotifications | Supprime notifs >30j |
| 03h30 | cleanupExpiredTokens | Supprime refresh tokens expires |

Advisory locks PostgreSQL pour eviter execution concurrente.

---

## Authentification

| Param | Valeur |
|-------|--------|
| Access token practitioner | JWT **7 jours** |
| Access token client | JWT 15 min |
| Refresh token | JWT 90 jours, httpOnly cookie `mdr_refresh_token` |
| Hash | Bcrypt 12 rounds |
| Brute force | 5 tentatives -> lockout 15 min |
| Max sessions | 5 par user |
| Storage dashboard | `mdr_user`, `mdr_access_token` (localStorage) |

### Credentials Celia (seed)
- **Email** : `celia@lamaisonduregard.fr`
- **Password** : `admin123`

A changer pour les vrais credentials de Celia : `maisonduregard38@gmail.com`

---

## URLs

| Composant | URL dev | URL prod |
|-----------|---------|----------|
| Site | `http://localhost:5500` | `https://lamaisonduregard.fr` |
| Backend | `http://localhost:3000/api` | `https://api.lamaisonduregard.fr/api` |
| Dashboard | `http://localhost:5175` | `https://gestion.lamaisonduregard.fr` |

Detection auto : `window.location.hostname === 'localhost'` → dev / sinon → prod

---

## Design System

### Site vitrine
| Propriete | Valeur |
|-----------|--------|
| Fond | `#FFF5F0` (peach) |
| Texte | `#3D2C2E` (dark warm) |
| Accent | `#C9A96E` (gold) |
| CTA gradient | `linear-gradient(135deg, #ff9a9e, #fcb69f)` |
| Font titres | Playfair Display |
| Font corps | Montserrat |
| Font accent | Cormorant Garamond (italic) |
| Bottom nav | Pill fixe en bas, 5 items, RDV flottant au centre |
| CSS | `styles.css` global (2088 lignes) + inline specifique par page |

### Dashboard admin
| Propriete | Valeur |
|-----------|--------|
| Theme | **CLAIR** peach/gold (PAS dark) |
| Fond | `#FFF5F0` |
| Cards | `#FFFFFF` avec shadow |
| Accent | `#C9A96E` (gold) |
| Sidebar | 240px (collapse 64px), bottom nav mobile |
| Breakpoint | 1024px (`useMobile()` hook) |
| Font body | Montserrat |
| Font heading | Playfair Display |
| CSS | `index.css` ~1250 lignes |
| Routing | HashRouter (#) |
| Lazy loading | React.lazy() + Suspense |

---

## Regles metier

### Reservation (flow public — 3 etapes, pas 4)
1. **Choix prestation** — Onglets categorie (sourcils/maquillage permanent/cils)
2. **Choix creneau** — Date picker + slots 15min
3. **Infos client** — Telephone, prenom, email optionnel + recap + confirmation

**Pas de choix barber** — Celia est seule.

### Contraintes
- **Prix en centimes** : 25000 = 250,00e
- **Creneaux** : 15 min public, 5 min admin
- **Avance max** : 6 mois
- **Annulation** : minimum **24h** avant (vs 12h BarberClub)
- **Modification** : 1 seule fois, minimum 24h avant
- **Double-booking** : UNIQUE index + advisory lock
- **Pas d'espace "Mon Compte"** — cancel_token dans l'email

### Convention day_of_week
- **0 = Lundi, 6 = Dimanche** (PAS la convention JS)

### Horaires Celia (seed)
- Lundi → Vendredi : 9h-19h
- Samedi : 9h-17h
- Dimanche : OFF

### Adresse
- **26 Av. du Gresivaudan, 38700 Corenc** (memes locaux que BarberClub Meylan)

---

## Notifications

| Type | Declencheur | Canal | Statut |
|------|-------------|-------|--------|
| Confirmation RDV | Creation booking | Email | Actif |
| Rappel J-1 | Cron 18h | SMS | Actif |
| Avis Google | 60min post-completed (1x/client) | SMS | Actif (toggle dashboard) |
| Annulation | Annulation | Email | Actif |
| Reschedule | Modification | Email | Actif |
| Reset password | forgot-password | Email | Actif |

---

## Commandes dev

```bash
# Backend
cd backend && npm run dev          # API sur :3000 (--watch auto-reload)

# Dashboard
cd dashboard && npm run dev        # React sur :5175 (HMR)

# Site vitrine
npx serve -l 5500                  # Static sur :5500
```

---

## Bugs connus et patterns (herites de BarberClub)

| Pattern | Solution | Fichier |
|---------|----------|---------|
| DATE PostgreSQL -> timezone | `types.setTypeParser(1082, val => val)` | database.js |
| TIME retourne `HH:MM:SS` | `.slice(0,5)` | Partout |
| day_of_week 0=Lundi vs JS | Conversion explicite | availability.js |
| UUIDs seed non-standard | `.matches(uuidRegex)` pas `.isUUID()` | Routes |
| `.isDate({ format })` bugge | `.matches(/^\d{4}-\d{2}-\d{2}$/)` | Routes |
| Trust proxy manquant | `app.set('trust proxy', 1)` | index.js |
| XSS dans emails | `escapeHtml()` | notification.js |
| Race condition booking | Advisory lock + `SELECT...FOR UPDATE` | booking.js |
| Retry explosif | Backoff 5->15->60 min, max 3 | notification.js |
| Circuit breaker Brevo | 3 failures -> cooldown 60s | notification.js |

---

## Notes pour Claude

1. **Projet 100% separe de BarberClub** — propre backend, propre BDD, propre dashboard
2. **Praticienne unique** — pas de barber_id, pas de multi-salon, pas de salon_id
3. **Prix en centimes** — 25000 = 250,00e. Frontend fait `/ 100`
4. **Slots 15 min** (public) vs 30 min BarberClub
5. **Annulation 24h** vs 12h BarberClub (prestations plus longues)
6. **Theme CLAIR** — peach/gold, pas dark comme BarberClub
7. **3 etapes de reservation** (pas 4, pas de choix barber)
8. **Cookie** : `mdr_refresh_token` (pas `bc_`)
9. **Storage** : `mdr_access_token`, `mdr_user` (pas `bc_`)
10. **day_of_week** : 0=Lundi en BDD
11. **HashRouter** — Dashboard utilise `#` dans les URLs
12. **Backend `--watch`** — Auto-reload en dev
13. **Crons** — Desactives en dev
14. **Categories services** : sourcils, maquillage_permanent, cils
15. **Adresse** : 26 Av. du Gresivaudan, 38700 Corenc (memes locaux BarberClub Meylan)

---

## Ce qui reste a faire

### Infra (priorite haute)
1. [ ] Creer projet Railway (nouveau, meme compte)
2. [ ] Creer BDD PostgreSQL sur Railway
3. [ ] Executer `database/schema.sql` puis `database/seed.sql`
4. [ ] Configurer variables env Railway (copier `.env.example`, remplir secrets)
5. [ ] Generer `JWT_SECRET` et `JWT_REFRESH_SECRET` (256-bit chacun)
6. [ ] Deployer backend sur Railway (auto-deploy sur git push)
7. [ ] Tester `GET /api/health` en prod

### Brevo
8. [ ] Configurer sender email `noreply@lamaisonduregard.fr` sur Brevo
9. [ ] SPF/DKIM pour le domaine `lamaisonduregard.fr`
10. [ ] Verifier credits SMS Brevo
11. [ ] Tester envoi email + SMS en dev

### Dashboard
12. [ ] Deployer dashboard sur Cloudflare Pages (`barberclub-dashboard` → nouveau projet `mdr-dashboard`)
13. [ ] Tester login Celia sur dashboard prod

### DNS
14. [ ] Ajouter CNAME `api.lamaisonduregard.fr` → Railway
15. [ ] Ajouter CNAME `gestion.lamaisonduregard.fr` → Cloudflare Pages
16. [ ] Configurer custom domains sur Railway et Cloudflare Pages

### Credentials Celia
17. [ ] Changer email seed → `maisonduregard38@gmail.com` (son vrai email)
18. [ ] Changer mot de passe → un vrai MDP securise
19. [ ] Ajouter son vrai numero de telephone

### Site
20. [ ] Tester flow complet reservation (`/reserver/`)
21. [ ] Tester gestion RDV (`/mon-rdv/`)
22. [ ] Tester reset password (`/reset-password/`)
23. [ ] Verifier bottom nav sur toutes les pages (liens Iara → `/reserver/`)
24. [ ] Deployer site mis a jour sur Cloudflare Pages

### Post-lancement
25. [ ] Configurer `GOOGLE_REVIEW_URL` pour les avis
26. [ ] Activer/desactiver automation review_sms selon preference Celia
27. [ ] Former Celia sur le dashboard
28. [ ] Monitoring : verifier crons, emails, SMS pendant 1 semaine
