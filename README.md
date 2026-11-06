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
- Un onglet **⭐ Tous** qui liste tous les artistes de A à Z, dans une **liste qui défile toute seule** (la page ne bouge pas). Une barre **A, B, C…** saute directement à une lettre, et un **filtre** retrouve un nom tout de suite.
- **N'importe quel autre artiste** grâce à la recherche Deezer, et un bouton 🎲 qui ajoute un artiste au hasard. La recherche choisit le vrai artiste (nom exact, le plus de fans) plutôt qu'un homonyme.
- **Playlists** : Top du moment, Top Rap, Pop, R&B, Dance et Rock (les classements Deezer de ton pays).
- **Mix** : jusqu'à 8 artistes ou playlists en même temps.
- **À deviner** : 🎵 le titre, ou 🎤 « Qui chante ? » (on devine l'artiste).
- **Morceaux** : ⭐ les hits (top 50), 📀 le top 100, ou 💿 **toute la disco**, le réglage par défaut : tous les albums, EP et singles de l'artiste, plus ses featurings.
- **Moins de répétitions** : le jeu retient les morceaux déjà entendus et fait passer les nouveaux en premier.

### 🎧 Solo
- **3 modes** : 🎯 Classique (5 à 30 questions), ❤️ Survie (3 vies), ⏱️ Chrono (90 s, une erreur coûte 5 s).
- **3 difficultés** : Facile (20 s), Normal (12 s), Difficile (6 s, avec un passage pris au hasard dans le morceau).
- **Score** : 100 pts + un bonus de vitesse. Les points sont multipliés par 1,5 à partir de 3 bonnes réponses d'affilée, et par 2 à partir de 5.
- **Jokers** : ✂️ 50/50, 💡 Indice (les points de la question sont divisés par 2), ⏭️ Passer.
- **Pause** avec le bouton ⏸️ ou la touche `Échap`, et un **compte à rebours 3D** avant chaque partie.
- **⚡ Partie rapide** : un artiste connu au hasard, et la partie se lance tout de suite.
- **Défis** : le bouton « Défier un pote » crée un lien avec les mêmes réglages et ton score à battre.

### 🃏 Choix du mode
Les modes de jeu sont présentés en **cartes** : 🎯 Blind test, 🎤 Qui chante ?, ❤️ Survie, ⏱️ Chrono, ⚔️ Battle, 🎲 Battle à thème et 🏆 Défi thème. Le bouton Solo / En ligne est à côté. Les modes réservés au solo sont grisés en ligne.

### 🏆 Défi thème
- Un **thème** est tiré au hasard (« pour rouler de nuit », « pour jouer à la console »…).
- Tu as **60 secondes** pour chercher **n'importe quel son** sur Deezer (avec des idées tirées de ta sélection), l'écouter et le valider.
- À la fin de la manche, **l'IA donne un pourcentage à chaque son** (par exemple 66 % contre 34 %) et explique son choix. **Ton pourcentage, ce sont tes points.**
- En **solo**, tu affrontes **le bot**, qui pioche dans ta sélection d'artistes. En **ligne**, tous les joueurs du salon s'affrontent.

### ⚔️ Battles
- **⚔️ Battle** : deux hits s'affrontent, soit de **deux artistes différents**, soit du **même artiste**. On écoute les deux extraits et on choisit le meilleur.
- **🎲 Battle à thème** : un thème est tiré au hasard parmi 22 (« pour se motiver à la salle », « pour un chagrin d'amour », « le plus nostalgique », « pour rouler de nuit »…). Il faut choisir le son qui colle le mieux au thème.
- **L'IA juge chaque duel et explique son choix** :
  - par défaut, l'**IA du jeu** (gratuite, sans compte) analyse le tempo (BPM), la popularité, l'année et les paroles des deux sons ;
  - si tu colles ta **clé d'API Claude** dans ton profil (🤖 IA des battles), c'est Claude qui juge. La clé reste dans ton navigateur, et chaque verdict est facturé sur ton compte Anthropic.
- **En solo**, tu gagnes des points quand le public (le son le plus écouté sur Deezer) et l'IA sont d'accord avec toi.
- **En ligne**, la majorité du salon désigne le gagnant, et l'IA départage les égalités. On gagne des points en votant avec la majorité et en étant d'accord avec l'IA.

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
| `js/battle.js` | Modes Battle et Battle à thème, thèmes, IA juge (intégrée ou Claude), notes en % |
| `js/pick.js` | Mode Défi thème : recherche du son, bot, révélation avec les pourcentages |
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

## Pourquoi Deezer (et pas Spotify ou YouTube) ?

- **Deezer** donne gratuitement un extrait de 30 s pour presque tous les titres, sans compte ni clé. C'est parfait pour un blind test.
- **Spotify** ne fournit plus d'extraits aux nouvelles applications depuis fin 2024. Pour lire la musique, chaque joueur devrait se connecter avec un compte Premium.
- **YouTube** demande une clé d'API et limite le nombre de recherches par jour (environ 100). Un site public serait vite bloqué.

Pour avoir plus de sons d'un artiste, choisis **💿 Toute la disco** : tous ses albums, EP, singles et featurings sont chargés.
