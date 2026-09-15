import unittest

from cartridge_index.matching import (TitleIndex, norm, seq, slugify, tidy_filename,
                                      variants)


def index(*titles, **kw):
    return TitleIndex([{"title": t} for t in titles], rejects=kw.pop("rejects", None), **kw)


class Normalisation(unittest.TestCase):
    def test_articles_punctuation_and_tags_fold_away(self):
        self.assertEqual(norm("Legend of Zelda, The (USA) (Rev 1)"),
                         norm("The Legend of Zelda"))
        self.assertEqual(norm("Battletoads & Double Dragon"),
                         norm("Battletoads-Double Dragon"))

    def test_our_own_suffixes_are_not_part_of_a_title(self):
        self.assertEqual(norm("castlevania-iii-draculas-curse-overdump"),
                         norm("Castlevania III: Dracula's Curse"))
        self.assertEqual(norm("charlie-blasts-territory-unidentified"),
                         norm("Charlie Blast's Territory"))

    def test_sequence_signature(self):
        self.assertEqual(seq("Final Fantasy III"), "3")
        self.assertEqual(seq("WWF Raw (1994)"), seq("WWF Raw"))
        self.assertEqual(seq("GT64 Championship Edition"), seq("GT 64 - Championship Edition"))
        self.assertEqual(seq("Sega Game Pack 4in1"), seq("Sega Game Pack 4 in 1"))
        self.assertNotEqual(seq("Micro Machines - Turbo Tournament 96"), seq("Micro Machines"))

    def test_roman_and_digit_forms_are_both_indexed(self):
        self.assertIn(norm("Zelda 2"), variants("Zelda II"))

    def test_slug(self):
        self.assertEqual(slugify("Mike Tyson's Punch-Out!! (USA)"), "mike-tysons-punch-out-usa")
        self.assertEqual(slugify("Pokémon Snap"), "pokemon-snap")

    def test_organizer_suffixes_and_eaten_apostrophes(self):
        self.assertEqual(norm("super-contra-unverified-dump-dup-1"), norm("Super Contra"))
        self.assertEqual(norm("disney-s-donald-duck-goin-quackers-unidentified"),
                         norm("Disney's Donald Duck: Goin' Quackers"))
        self.assertEqual(seq("Contra 3"), "3")          # a real trailing number survives
        self.assertEqual(norm("disneys-donald-duck-goin-quackers"),
                         norm("Disney's Donald Duck: Goin' Quackers"))

    def test_names_keep_region_and_translation_words(self):
        self.assertEqual(tidy_filename("yuu-yuu-hakusho-2-eng-unidentified"), "Yuu Yuu Hakusho 2 Eng")
        self.assertEqual(norm("yuu-yuu-hakusho-2-eng-unidentified"), norm("Yuu Yuu Hakusho 2"))

    def test_tidy_filename(self):
        self.assertEqual(tidy_filename("castlevania-iii-draculas-curse-overdump"),
                         "Castlevania III Draculas Curse")
        self.assertEqual(tidy_filename("Bank Panic # SG-1000"), "Bank Panic")
        self.assertEqual(tidy_filename("Super_Mario_Bros_(U)_[!]"), "Super Mario Bros")


class Gates(unittest.TestCase):
    """Every case here is a wrong match an earlier version of this code made."""

    def test_numbers_gate_every_tier(self):
        ix = index("Dig Dug", "Sonic the Hedgehog", "Micro Machines", "Ready 2 Rumble Boxing")
        self.assertIsNone(ix.match("Dig Dug II"))
        self.assertIsNone(ix.match("Sonic the Hedgehog 2"))
        self.assertIsNone(ix.match("Micro Machines - Turbo Tournament 96"))
        self.assertIsNone(ix.match("Ready 2 Rumble Boxing - Round 2"))

    def test_head_tier_needs_exactly_one_subtitle(self):
        ix = index("Spider-Man", "Abadox", "Donkey Kong Country 2", "Micro Machines")
        self.assertIsNone(ix.match("Spider-Man - X-Men - Arcade's Revenge"))
        self.assertEqual(ix.match("Abadox - The Deadly Inner War").how, "head")
        self.assertEqual(ix.match("Donkey Kong Country 2 - Diddy's Kong Quest").how, "head")
        # the numbers gate still applies to the full title
        self.assertIsNone(ix.match("Micro Machines - Turbo Tournament 96"))

    def test_head_tier_works_from_the_pool_side(self):
        ix = index("Mickey Mania: The Timeless Adventures of Mickey Mouse")
        self.assertEqual(ix.match("Mickey Mania").how, "head")

    def test_head_tier_refuses_ambiguity(self):
        ix = index("Batman: Revenge of the Joker", "Batman: The Video Game")
        self.assertIsNone(ix.match("Batman", prefix=False, fuzzy=False))

    def test_reviewed_rejects(self):
        ix = index("OutRun", "Super C", "Shadowrun")
        self.assertIsNone(ix.match("OutRunners"))
        self.assertIsNone(ix.match("Super Cars"))
        self.assertIsNone(ix.match("Shadow, The"))

    def test_good_matches_still_land(self):
        ix = index("Prince of Persia 2: The Shadow and the Flame",
                   "World Class Leaderboard Golf", "Charlie Blasts Territory")
        self.assertEqual(ix.match("Prince of Persia 2").how, "head")
        self.assertIsNotNone(ix.match("World Class Leaderboard"))
        self.assertEqual(ix.match("charlie-blast-s-territory-unidentified").how, "title")

    def test_ambiguous_prefix_is_a_non_match(self):
        ix = index("Super Mario Bros. Deluxe Edition Pack", "Super Mario Bros. Deluxe Pack Set")
        self.assertIsNone(ix.match("Super Mario Bros. Deluxe"))

    def test_prefer_picks_among_equal_candidates(self):
        ix = TitleIndex([{"title": "Tetris", "votes": 10}, {"title": "TETRIS", "votes": 900}],
                        prefer=lambda m: -m["votes"], rejects=set())
        self.assertEqual(ix.match("Tetris").item["votes"], 900)

    def test_fuzzy_needs_the_same_digits(self):
        ix = index("Adventure Island")
        self.assertIsNone(ix.match("Adventure Island 4", prefix=False))
        self.assertEqual(ix.match("Adventure Islnd", prefix=False).how, "fuzzy")


if __name__ == "__main__":
    unittest.main()
