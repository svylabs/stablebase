PRECISION = 1e18

def JsonHandler(Obj):
    if hasattr(Obj, '__json__'):
        return Obj.__json__()
    else:
        raise TypeError('Object of type %s with value of %s is not JSON serializable' % (type(Obj), repr(Obj)))

class Uint:
    def __init__(self, value, scaled=True):
        self.value = value * PRECISION if not scaled else value

    def zero():
        return Uint(0)

    def one():
        return Uint(1)

    def ONE():
        return Uint(PRECISION)
    
    def HALF():
        return Uint(1e9)
    
    def unscaled(value):
        return Uint(value, scaled=False)

    def __add__(self, other):
        return Uint(self.value + other.value)
    
    def __iadd__(self, other):
        self.value += other.value
        return self
    
    def __sub__(self, other):
        return Uint(self.value - other.value)

    def __mul__(self, other):
        return Uint(self.value * other.value)

    def __lt__(self, other):
        return self.value < other.value
    
    def __le__(self, other):
        return self.value <= other.value
    
    def __gt__(self, other):
        return self.value > other.value
    
    def __ge__(self, other):
        return self.value >= other.value
    
    def __eq__(self, other):
        return self.value == other.value
    
    def __ne__(self, other):
        return self.value != other.value
    
    def __truediv__(self, other):
        return Uint(self.value // other.value)
    
    def __repr__(self):
        return str(self.value / PRECISION)
    
    def __str__(self):
        return str(self.value / PRECISION)
    
    def clone(self):
        return Uint(self.value, scaled=True)
