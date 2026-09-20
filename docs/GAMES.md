# Games and themes

Launch includes exactly seven game records. The game picker, selected game, palette, and visual motif are driven by game data. Create or edit games in host settings for everyday use. Developers can also edit `config/games.json` and restart the server; a frontend rebuild is not needed to add a game using an existing motif and theme family.

Each definition has a stable `id`, a displayed `name`, a `themeKey`, a short `tagline`, a `motif`, and a `palette`. Copy an existing record as the safest starting point and give it a unique ID. The palette contains `background`, `surface`, `text`, `muted`, `accent`, `accentText`, and `secondary` colors. Use hexadecimal colors with readable contrast. Keep the player-count card white with black text.

Configuration seeds are synchronized at startup. Admin changes to an existing game persist while its config definition stays the same; changing that definition explicitly reapplies it. Removing a definition does not erase existing game history. Archive a game in the host UI to hide it from selection while preserving its wins.

Seven built-in theme families reinterpret the games with original geometry and color. Monopoly uses board tokens, Challengers uses a tournament treatment, Coup uses cards, Poker uses suits/chips, Among Us uses space, Murder Mafia uses noir, and Clue uses mansion mystery. Use the existing records to find supported `themeKey` and `motif` values. A completely new animation or new font family needs a code change; an eighth game reusing current primitives does not.

Fonts and assets are bundled locally. Do not insert external image URLs, executable scripts, or official logos into a definition. New palette choices should be checked on both a phone and the room's shared screen, including keyboard focus and reduced-motion mode.
