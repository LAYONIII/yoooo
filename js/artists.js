/* =========================================================
   artists.js : les suggestions d'artistes par catégorie.
   Pour ajouter un artiste, écris simplement son nom tel qu'il
   apparaît sur Deezer : le site retrouve tout seul sa photo et ses titres.
   ========================================================= */
window.BT = window.BT || {};
BT.CATEGORIES = [
  {
    id: 'fr', label: '🇫🇷 Rap FR', desc: 'La nouvelle génération',
    artists: ['Ninho', 'Jul', 'PNL', 'Damso', 'SCH', 'Booba', 'Gazo', 'Tiakola', 'Werenoi', 'Nekfeu', 'Orelsan', 'Niska', 'Hamza', 'Naps', 'Zola', 'Koba LaD', 'Leto', 'SDM', 'Freeze Corleone', 'Josman', 'Kalash Criminel', 'Alonzo', "Heuss L'enfoiré", 'Maes', 'Vald', 'Lomepal', 'Bigflo & Oli', 'Laylow', 'Dinos', 'Ziak', 'Gradur', 'Plk', 'Soso Maness', 'Guy2Bezbar', 'La Fève', 'Bouss'],
  },
  {
    id: 'frold', label: '📼 Rap FR old school', desc: 'Les classiques',
    artists: ['IAM', 'Suprême NTM', 'MC Solaar', "Diam's", 'Rohff', "Sexion d'Assaut", '113', 'Kery James', 'Sinik', 'La Fouine', 'Lunatic', 'Oxmo Puccino', 'Sniper', 'Psy 4 de la Rime', 'Soprano', "Mafia K'1 Fry", 'Fonky Family', 'Médine', 'Youssoupha', 'Disiz', 'Sefyu', 'Akhenaton', 'Passi', 'Lacrim', 'Kaaris', 'Rim\'K', 'Tunisiano', 'Scred Connexion', 'Ministère A.M.E.R.', 'Keny Arkana'],
  },
  {
    id: 'us', label: '🇺🇸 Rap US', desc: 'Les stars du moment',
    artists: ['Drake', 'Kendrick Lamar', 'Travis Scott', 'Eminem', 'Kanye West', 'Future', 'J. Cole', '21 Savage', 'Lil Baby', 'Post Malone', 'Nicki Minaj', 'Tyler, The Creator', 'Jay-Z', '50 Cent', 'Snoop Dogg', 'Lil Wayne', 'Cardi B', 'Doja Cat', 'Megan Thee Stallion', 'A$AP Rocky', 'Playboi Carti', 'Lil Uzi Vert', 'Juice WRLD', 'XXXTENTACION', 'Pop Smoke', 'Young Thug', 'Gunna', 'Metro Boomin', 'Mac Miller', 'Childish Gambino', 'Don Toliver', 'Central Cee'],
  },
  {
    id: 'usold', label: '🎙️ Légendes du rap US', desc: 'Années 90 et 2000',
    artists: ['2Pac', 'The Notorious B.I.G.', 'Dr. Dre', 'Nas', 'Wu-Tang Clan', 'Outkast', 'Ice Cube', 'DMX', 'Busta Rhymes', 'Missy Elliott', 'N.W.A', 'Run-DMC', 'Public Enemy', 'Nelly', 'Ludacris', 'Lauryn Hill', 'Fugees', 'Coolio', 'Cypress Hill', 'Mobb Deep', 'Method Man', 'Xzibit', 'T.I.', 'Akon', 'Black Eyed Peas', 'Kid Cudi', 'Lil Jon', 'Warren G'],
  },
  {
    id: 'frpop', label: '💜 Pop & R&B FR', desc: 'Les voix françaises',
    artists: ['Aya Nakamura', 'Angèle', 'Stromae', 'Indila', 'Dadju', 'Tayc', 'Gims', 'Vitaa', 'Slimane', 'Kendji Girac', 'Louane', 'Zaz', 'Christophe Maé', 'Amel Bent', 'Jenifer', 'M. Pokora', 'Nolwenn Leroy', 'Clara Luciani', 'Juliette Armanet', 'Pierre Garnier', 'Santa', 'Vianney', 'Julien Doré', 'Black M', "Keen'V", 'Imen Es', 'Wejdene', 'Marwa Loud', 'Naza', 'Soolking', 'Shy\'m', 'Matt Pokora'],
  },
  {
    id: 'pop', label: '💃 Pop monde', desc: 'Les hits internationaux',
    artists: ['Dua Lipa', 'The Weeknd', 'Rihanna', 'Beyoncé', 'Taylor Swift', 'Billie Eilish', 'Ed Sheeran', 'Ariana Grande', 'Justin Bieber', 'Bruno Mars', 'Lady Gaga', 'Katy Perry', 'Harry Styles', 'Olivia Rodrigo', 'Sabrina Carpenter', 'SZA', 'Chris Brown', 'Usher', 'Sia', 'Adele', 'Miley Cyrus', 'Selena Gomez', 'Shawn Mendes', 'Lana Del Rey', 'Charli xcx', 'Chappell Roan', 'Ne-Yo', 'Jason Derulo', 'Pitbull', 'Rema', 'Benson Boone'],
  },
  {
    id: 'varfr', label: '🎻 Variété française', desc: 'Les grands classiques',
    artists: ['Johnny Hallyday', 'Édith Piaf', 'Jacques Brel', 'Charles Aznavour', 'Serge Gainsbourg', 'Michel Sardou', 'Daniel Balavoine', 'Jean-Jacques Goldman', 'Céline Dion', 'Mylène Farmer', 'France Gall', 'Claude François', 'Joe Dassin', 'Renaud', 'Francis Cabrel', 'Michel Berger', 'Dalida', 'Indochine', 'Téléphone', 'Alain Souchon', 'Patrick Bruel', 'Michel Polnareff', 'Julien Clerc', 'Véronique Sanson', 'Calogero', 'Pascal Obispo', 'Florent Pagny', 'Garou', 'Les Rita Mitsouko', 'Noir Désir', 'Eddy Mitchell', 'Sheila', 'Gilbert Bécaud', 'Mike Brant', 'Laurent Voulzy', 'Desireless'],
  },
  {
    id: 'legend', label: '👑 Légendes', desc: 'Les icônes mondiales',
    artists: ['Michael Jackson', 'Queen', 'ABBA', 'The Beatles', 'Elvis Presley', 'Madonna', 'Whitney Houston', 'Bob Marley', 'Prince', 'Stevie Wonder', 'Elton John', 'David Bowie', 'The Rolling Stones', 'Tina Turner', 'Aretha Franklin', 'Marvin Gaye', 'Frank Sinatra', 'Bee Gees', 'Phil Collins', 'George Michael', 'Cyndi Lauper', 'Bon Jovi', 'Lionel Richie', 'Mariah Carey', 'Britney Spears', 'Backstreet Boys', 'Spice Girls', 'Eurythmics', 'Earth, Wind & Fire', 'Kool & The Gang', 'Boney M.', 'Gloria Gaynor', 'Ray Charles', 'James Brown', 'Amy Winehouse', 'Toto'],
  },
  {
    id: 'rock', label: '🎸 Rock', desc: 'Guitares et refrains cultes',
    artists: ['AC/DC', 'Nirvana', 'Linkin Park', 'Coldplay', 'Imagine Dragons', 'Arctic Monkeys', 'Red Hot Chili Peppers', 'Metallica', "Guns N' Roses", 'Muse', 'Green Day', 'The Killers', 'Oasis', 'U2', 'Pink Floyd', 'Led Zeppelin', 'Foo Fighters', 'System Of A Down', 'Maroon 5', 'OneRepublic', 'Twenty One Pilots', 'Gorillaz', 'Radiohead', 'The White Stripes', 'Evanescence', 'Rammstein', 'Måneskin', 'Blink-182', 'The Cranberries', 'Scorpions'],
  },
  {
    id: 'electro', label: '🪩 Électro & Dance', desc: 'Pour faire danser',
    artists: ['Daft Punk', 'David Guetta', 'Avicii', 'Calvin Harris', 'Martin Garrix', 'Bob Sinclar', 'DJ Snake', 'Kygo', 'Swedish House Mafia', 'The Chainsmokers', 'Marshmello', 'Alan Walker', 'Major Lazer', 'Skrillex', 'Tiësto', 'Justice', 'Fred again..', 'Lost Frequencies', 'Robin Schulz', 'Ofenbach', 'Kungs', 'Purple Disco Machine', 'Martin Solveig', 'Eiffel 65', 'Modjo', 'Stardust'],
  },
  {
    id: 'afro', label: '🌍 Afro & Latino', desc: 'Afrobeats, reggaeton, rumba',
    artists: ['Burna Boy', 'Wizkid', 'Ayra Starr', 'Davido', 'Tiwa Savage', 'Tyla', 'Fally Ipupa', 'Magic System', 'DJ Arafat', 'Bad Bunny', 'Shakira', 'J Balvin', 'Daddy Yankee', 'Karol G', 'Rosalía', 'Ozuna', 'Maluma', 'Anitta', 'Peso Pluma', 'Feid', 'Rauw Alejandro', 'Enrique Iglesias', 'Ricky Martin', 'Luis Fonsi', 'Manu Chao', 'Gipsy Kings', 'Kaoma', 'Sean Paul'],
  },
];
