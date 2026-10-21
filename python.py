K = 1 / 6174
DEPTH = 0.28        # tread depth, metres
MAX_RISE = 0.19     # regulation max, metres
SUMMIT_X = 84       # where dy/dx = 0


def y(x):
    return K * x * x * (126 - x)


def check():
    n_steps = round(SUMMIT_X / DEPTH)
    tallest = 0.0
    where = 0.0

    for n in range(n_steps):
        x0 = n * DEPTH
        x1 = (n + 1) * DEPTH
        rise = y(x1) - y(x0)
        if rise > tallest:
            tallest = rise
            where = x0

    print(f"number of steps : {n_steps}")
    print(f"tallest step    : {tallest * 1000:.1f} mm  (between x = {where:.2f} and {where + DEPTH:.2f} m)")
    print("verdict         :", "OK" if tallest <= MAX_RISE else "FAILS the 190 mm limit")


check()