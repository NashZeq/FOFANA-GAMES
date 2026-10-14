# Casus Belli — web implementation notes

This build uses the core flow described in the public Casus Belli V28 guide:
- Classic match is two-player.
- Each kingdom has separate Army (15 cards) and Support (10 cards) decks and separate trash piles.
- Each round, players draw up to two cards from either deck.
- Players secretly submit at least one card; unplayed cards return to the bottom of their corresponding deck.
- Support cards are single-use and offer two choices; the selected effect resolves according to a speed tier.
- Army cards are compared by combined strength; a winning army returns to its deck, losing army cards go to trash, and ties send both sides' army cards to trash.
- A player with no cards left in either deck loses.

The web version includes original generated fantasy card illustrations stored locally under `public/assets/casus-cards/`.

Note: the support card names/effects in this web build are custom implementations inspired by the guide's support-card mechanic, not a transcription of the physical game's complete card text. The aggregate-strength combat resolution is a simplified digital interpretation; the physical rules include additional card-specific interactions and casualty rules. This build currently implements the classic two-player mode, not the alternate 3/4-player party variants.

Reference used for the core rules: Casus Belli Kılavuz Belgesi V28 (Lodos), publicly indexed at https://www.scribd.com/document/999352832/Casus-Belli-K%C4%B1lavuz-Belgesi-V28
