# 🎧 Blind Test

Un site de blind test musical : choisis un ou plusieurs artistes, écoute un extrait et trouve le bon titre parmi 4 propositions.

## Lancer le jeu

Aucune installation n'est nécessaire. **Ouvre `index.html` dans ton navigateur**, et c'est tout.

Tu peux aussi lancer un petit serveur local :

```bash
python3 -m http.server 8000
```

Puis va sur http://localhost:8000.

### Mettre le site en ligne gratuitement (GitHub Pages)

Dans le dépôt GitHub : **Settings → Pages → Branch : `main` / root → Save**. Le site sera disponible à l'adresse `https://<ton-pseudo>.github.io/yoooo/`.

## Fonctionnalités

- 🔎 **N'importe quel artiste** : recherche (avec l'API Deezer), plus des suggestions Rap FR, Rap US et Pop/R&B, et la liste de tes artistes récents.
- 🎵 **Mix d'artistes** : sélectionne jusqu'à 8 artistes pour mélanger leurs morceaux.
- 🎯 **3 modes** : Classique (5 à 20 questions), ❤️ Survie (3 vies), ⏱️ Chrono (90 s, une erreur coûte 5 s).
- 💀 **3 difficultés** : Facile (20 s), Normal (12 s), Difficile (6 s, avec un passage pris au hasard dans le morceau).
- 📀 **Choix des morceaux** : seulement les hits (top 25) ou toute la discographie (jusqu'à 100 titres).
- ⚡ **Score** : 100 pts par bonne réponse, plus un bonus de vitesse et un multiplicateur de série (×1,5 dès 3 bonnes réponses d'affilée, ×2 dès 5).
- 🃏 **Jokers** : 50/50 et Passer (un de chaque par partie).
- 💿 Vinyle animé, pochette révélée après chaque réponse, effets sonores, réglage du volume.
- 📋 **Récap de fin de partie** : réécoute de chaque extrait et lien vers le morceau sur Deezer.
- 🏆 **Classement local et stats** (parties jouées, précision, artiste préféré), avec les records enregistrés dans le navigateur.
- ⚔️ **Défis** : le bouton « Partager » crée un lien qui ouvre le jeu avec les mêmes artistes et les mêmes réglages, et qui affiche ton score à battre.
- ⌨️ Raccourcis clavier : `1` à `4` pour répondre, `Espace` pour réécouter, `Entrée` pour passer à la suite.
- 📱 Le site s'adapte aux mobiles.

## Technique

- HTML, CSS et JavaScript, sans framework ni dépendance.
- Les extraits de 30 s viennent de l'[API publique Deezer](https://developers.deezer.com/api), appelée en JSONP : il ne faut ni clé d'API ni serveur.
- Les scores et les réglages sont stockés dans le `localStorage` du navigateur.

| Fichier | Rôle |
|---|---|
| `index.html` | Structure des écrans (accueil, jeu, résultats, fenêtres) |
| `style.css` | Design (thème sombre néon, responsive) |
| `app.js` | Logique : API Deezer, déroulement de la partie, score, classement, partage |
