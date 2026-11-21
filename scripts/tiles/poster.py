# The reference map image to sRGB PNG, through its own colour profile (print files are CMYK; a plain
# conversion turns the sea mint). Usage: python poster.py <image.jpg> <out.png>
import io, sys
from PIL import Image, ImageCms
Image.MAX_IMAGE_PIXELS = None
im = Image.open(sys.argv[1])
icc = im.info.get('icc_profile')
if im.mode == 'CMYK' and icc:
    im = ImageCms.profileToProfile(im, ImageCms.ImageCmsProfile(io.BytesIO(icc)), ImageCms.createProfile('sRGB'), outputMode='RGB')
im.convert('RGB').save(sys.argv[2])
