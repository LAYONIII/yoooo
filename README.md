# 🎧 BlindTest

Un blind test musical **en solo ou en ligne avec tes potes** : choisis tes artistes ou une playlist, écoute l'extrait et trouve le bon titre parmi 4 propositions.

## Jouer

- **En ligne** : active GitHub Pages (voir plus bas), puis ouvre `https://<ton-pseudo>.github.io/yoooo/`.
- **Sur ton ordinateur** : lance un petit serveur dans le dossier du projet :

  ```bash
  python3 -m http.server 8000
  ```

  Puis ouvre http://localhost:8000. Ouvrir `index.html` directement marche aussi pour le solo.

### Mettre le site en ligne gratuitement (GitHub Pages)

Dans le dépôt GitHub : **Settings → Pages → Build and deployment → Branch**. Choisis la branche du site et le dossier `/ (root)`, puis clique sur **Save**. Après 1 à 2 minutes, le site est disponible à l'adresse `https://<ton-pseudo>.github.io/yoooo/`.

## Fonctionnalités

### 🎵 Musique
- **Plus de 300 artistes suggérés** dans 11 catégories : Rap FR, Rap FR old school, Rap US, Légendes du rap US, Pop & R&B FR, Pop monde, Variété française, Légendes, Rock, Électro & Dance, Afro & Latino. La liste est dans `js/artists.js` : pour ajouter un artiste, il suffit d'écrire son nom.
- **N'importe quel autre artiste** grâce à la recherche Deezer, et un bouton 🎲 qui ajoute un artiste au hasard.
- **Playlists** : Top du moment, Top Rap, Pop, R&B, Dance et Rock (les classements Deezer de ton pays).
- **Mix** : jusqu'à 8 artistes ou playlists en même temps.
- **À deviner** : 🎵 le titre, ou 🎤 « Qui chante ? » (on devine l'artiste).
- **Morceaux** : ⭐ les hits (top 50), 📀 le top 100, ou 💿 **toute la disco** (tous les albums, EP et singles de l'artiste, souvent plusieurs centaines de titres).

### 🎧 Solo
- **3 modes** : 🎯 Classique (5 à 30 questions), ❤️ Survie (3 vies), ⏱️ Chrono (90 s, une erreur coûte 5 s).
- **3 difficultés** : Facile (20 s), Normal (12 s), Difficile (6 s, avec un passage pris au hasard dans le morceau).
- **Score** : 100 pts + un bonus de vitesse. Les points sont multipliés par 1,5 à partir de 3 bonnes réponses d'affilée, et par 2 à partir de 5.
- **Jokers** : ✂️ 50/50, 💡 Indice (les points de la question sont divisés par 2), ⏭️ Passer.
- **Pause** avec le bouton ⏸️ ou la touche `Échap`, et un **compte à rebours 3D** avant chaque partie.
- **⚡ Partie rapide** : un artiste connu au hasard, et la partie se lance tout de suite.
- **Défis** : le bouton « Défier un pote » crée un lien avec les mêmes réglages et ton score à battre.

### 🌐 En ligne (multijoueur)
- Un joueur **crée un salon** et reçoit un **code à 6 caractères**. Les autres le rejoignent avec ce code ou avec le lien d'invitation (jusqu'à 12 joueurs).
- Tout le monde entend **le même extrait en même temps**, avec un **classement en direct**. Tu vois qui a déjà répondu.
- Le **premier** à trouver la bonne réponse gagne **+50 pts**.
- **Réactions emoji** en direct, **podium** animé à la fin, puis on peut relancer une partie dans le même salon.
- Aucun compte ni serveur à payer : les navigateurs se connectent directement entre eux (WebRTC via [PeerJS](https://peerjs.com)).

### ✨ Le reste
- **Profil** : pseudo et avatar.
- **12 succès** à débloquer.
- **Classement local et stats** (précision, artiste préféré).
- **Récap** de chaque partie, avec la réécoute des extraits et des liens vers Deezer.
- **Effets 3D** (Three.js) :
  - une platine vinyle 3D sur l'accueil, qui suit la souris, avec les photos des artistes choisis en orbite autour ;
  - un fond de particules et de formes néon qui bat au rythme de l'extrait et s'illumine en vert (bonne réponse) ou en rouge (erreur) ;
  - des cartes qui pivotent en 3D, le disque qui se retourne pour montrer la pochette, et des réponses qui s'affichent en 3D.
- **Plus pratique** :
  - une barre « Jouer » toujours visible en bas de l'écran ;
  - des pastilles qui montrent la progression de la partie ;
  - de vraies fenêtres de confirmation ;
  - un chargement qui affiche son avancement.
- Le site s'adapte au **mobile** et peut s'**installer comme une appli** sur le téléphone.
- **Raccourcis clavier** : `1` à `4` pour répondre, `Espace` pour réécouter, `Entrée` pour passer à la suite.

## Technique

HTML, CSS et JavaScript, sans framework ni étape de build.

| Fichier | Rôle |
|---|---|
| `index.html` | Structure des écrans et des fenêtres |
| `css/style.css` | Design (thème sombre néon, animations, responsive) |
| `js/artists.js` | Les suggestions d'artistes par catégorie |
| `js/fx3d.js` | Effets 3D (Three.js) et cartes qui pivotent |
| `js/core.js` | Outils, API Deezer (JSONP), création des questions, sons, confettis, profil, succès |
| `js/quiz.js` | Écran de question partagé : audio, chrono, réponses, jokers, clavier |
| `js/solo.js` | Parties solo, résultats, récap, liens de défi |
| `js/online.js` | Multijoueur : salon, synchronisation des questions, scores, podium |
| `js/app.js` | Accueil, sélection de la musique, réglages, profil, classement |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Installation du site comme une appli (PWA) |

- Extraits de 30 s : [API publique Deezer](https://developers.deezer.com/api), sans clé d'API.
- Multijoueur : l'hôte pilote la partie (questions et points), les invités envoient leurs réponses. Le serveur public de PeerJS sert seulement à mettre les joueurs en relation.
- Pour tester en local avec ton propre serveur PeerJS, lance `npx peer --port 9000`, puis ajoute `?peer=127.0.0.1:9000` à l'adresse du site.

> ℹ️ Sur certains réseaux très restrictifs (wifi d'entreprise ou d'école, certains forfaits mobiles), la connexion directe entre joueurs peut échouer. Dans ce cas, essaie un autre réseau.
