# 📅 Mes Tâches — Widget de bureau

Widget de bureau Tauri pour gérer des tâches et un calendrier, connecté à PostgreSQL et compatible n8n.

## ✨ Fonctionnalités

- **Vue Liste** : tâches groupées par échéance (En retard, Aujourd'hui, Demain, Cette semaine, Ce mois-ci, Plus tard, Sans échéance)
- **Vue Calendrier** : vues Mois / Trimestre / Année avec FullCalendar
- **CRUD complet** : créer, modifier, supprimer, changer le statut (À faire / En cours / Validé)
- **Listes personnalisées** : GLM, SCI, EXTRAS… avec couleurs et filtre par cases à cocher
- **Import / Export** : JSON, anti-doublon (ON CONFLICT DO NOTHING)
- **Temps réel** : `PgListener` sur le canal `tasks_changes` — toute modification est synchronisée instantanément entre tous les PC connectés
- **Widget discret** : fenêtre frameless, transparente, always-on-top, minimize + masquage
- **Compatible n8n** : triggers PostgreSQL (`LISTEN/NOTIFY`) et webhooks

## 🛠 Stack technique

| Couche | Technologie |
|---|---|
| Shell desktop | Tauri 2 |
| Frontend | React 19 + TypeScript + Vite |
| Calendrier | FullCalendar 6 |
| Backend | Rust + sqlx |
| Base de données | PostgreSQL |
| Automatisation | n8n |

## 📋 Prérequis

- **Node.js** 18+ et npm
- **Rust** (dernière stable) + Cargo
- **PostgreSQL** 14+ (Docker recommandé)
- **Docker Desktop** (optionnel, pour le conteneur PG)

## 🚀 Installation

### 1. Cloner le dépôt

```bash
git clone https://github.com/tomzpoker/Tom-Alpha-0.1.git
cd Tom-Alpha-0.1