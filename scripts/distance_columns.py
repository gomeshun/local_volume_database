"""Distance-modulus conversions for catalogue generation."""


def dist_mod(mu, mu_em=0, mu_ep=0):
    """Convert distance moduli and separate uncertainties to kpc.

    Parameters
    ----------
    mu : float or array-like
        Distance modulus in magnitudes.
    mu_em, mu_ep : float or array-like, optional
        Lower and upper uncertainties in magnitudes. Masked inputs
        propagate independently to the corresponding output.

    Returns
    -------
    tuple
        Distance, lower uncertainty and upper uncertainty in kpc.
    """
    def dm(x):
        return pow(10., x / 5. + 1.) / 1000.

    distance = dm(mu)
    return distance, distance - dm(mu - mu_em), dm(mu + mu_ep) - distance


def add_heliocentric_distances(input_table):
    """Add distance columns while preserving each row's uncertainty masks.

    Parameters
    ----------
    input_table : astropy.table.Table
        Table with distance_modulus, distance_modulus_em and
        distance_modulus_ep columns, updated in place.
    """
    distance, lower, upper = dist_mod(
        input_table["distance_modulus"],
        input_table["distance_modulus_em"],
        input_table["distance_modulus_ep"],
    )
    input_table["distance"] = distance
    input_table["distance_em"] = lower
    input_table["distance_ep"] = upper
