"""Regression tests for row-wise distance uncertainty propagation."""

import csv
import io
import os
from pathlib import Path
import unittest

import numpy as np
from astropy.table import MaskedColumn, Table

from distance_columns import add_heliocentric_distances


def make_table():
    """Return two measurements, two one-sided rows and an unknown distance."""
    return Table({
        "distance_modulus": MaskedColumn([28.04, 28.51, 28., 28., 0.],
                                        mask=[0, 0, 0, 0, 1]),
        "distance_modulus_em": MaskedColumn([.22, .08, .13, .17, .12],
                                           mask=[0, 0, 1, 0, 0]),
        "distance_modulus_ep": MaskedColumn([.22, .08, .12, .24, .12],
                                           mask=[0, 0, 0, 1, 0]),
    })


class DistanceColumnTests(unittest.TestCase):
    def test_asymmetric_uncertainties_and_masks(self):
        """A missing entry must never mask a complete measurement."""
        table = make_table()
        add_heliocentric_distances(table)
        np.testing.assert_array_equal(table["distance"].mask, [0, 0, 0, 0, 1])
        np.testing.assert_array_equal(table["distance_em"].mask, [0, 0, 1, 0, 1])
        np.testing.assert_array_equal(table["distance_ep"].mask, [0, 0, 0, 1, 1])
        np.testing.assert_allclose(table["distance"][:2], [4055.08535, 5035.00609])
        np.testing.assert_allclose(table["distance_em"][:2], [390.709608, 182.121086])
        np.testing.assert_allclose(table["distance_ep"][:2], [432.368545, 188.955802])

    def test_csv_serialization(self):
        """Retain known uncertainties and serialize unknown ones as blank."""
        table = make_table()
        add_heliocentric_distances(table)
        buffer = io.StringIO()
        table.write(buffer, format="ascii.csv")
        rows = buffer.getvalue().splitlines()[1:]
        self.assertEqual(rows[2].split(",")[-2], "")
        self.assertGreater(float(rows[2].split(",")[-1]), 0)
        self.assertEqual(rows[3].split(",")[-1], "")
        self.assertGreater(float(rows[3].split(",")[-2]), 0)

    def test_committed_field_dwarf_distances(self):
        """Check that the Explorer inputs preserve complete measurements."""
        data = Path(__file__).resolve().parents[1] / "data"
        for filename in ("dwarf_local_field.csv", "dwarf_local_field_distant.csv"):
            with (data / filename).open(newline="") as handle:
                rows = list(csv.DictReader(handle))
            eligible = [r for r in rows if float(r["distance_modulus_em"] or 0) > 0
                        and float(r["distance_modulus_ep"] or 0) > 0]
            self.assertTrue(eligible, filename)
            for row in eligible:
                # Allow a genuinely tiny error to round to zero, but demand
                # the same two-decimal kpc conversion as the generator.
                mu = float(row["distance_modulus"])
                lower = float(row["distance_modulus_em"])
                upper = float(row["distance_modulus_ep"])
                distance = 10 ** (mu / 5 - 2)
                with self.subTest(filename=filename, key=row["key"]):
                    self.assertAlmostEqual(float(row["distance_em"]),
                                           round(distance * (1 - 10 ** (-lower / 5)), 2))
                    self.assertAlmostEqual(float(row["distance_ep"]),
                                           round(distance * (10 ** (upper / 5) - 1), 2))

    def test_one_sided_distance_in_derived_quantities(self):
        """Use the existing fixed-distance fallback if either bound is absent."""
        os.environ.setdefault("LVDBDIR", str(Path(__file__).resolve().parents[1]))
        from local_volume_database import compute_mass_error, compute_rhalf_error

        for fun, extra in [(compute_rhalf_error, ()), (compute_mass_error, (3., .2, .2))]:
            args = (1., .1, .1, .2, .05, .05, 100.)
            expected = fun(*args, np.ma.masked, np.ma.masked, *extra, seed=1988)
            for lo, hi in [(5., np.ma.masked), (np.ma.masked, 5.)]:
                result = fun(*args, lo, hi, *extra, seed=1988)
                np.testing.assert_allclose(result, expected)


if __name__ == "__main__":
    unittest.main()
