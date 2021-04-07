#include "ui/SplashScreen.h"

#include <string>

#include "ui/Sprite2D.h"
#include "ui/Text.h"
#include "util/fonts.h"

SplashScreen::SplashScreen(const glm::vec3& textColor, const std::string& message, bool isPython)
    : logo_offset(0)
    , text_offset(0) {
    logo = std::make_shared<Sprite2D>(Texture2D::load(isPython ? "resources/pyflamegpu.png"  : "resources/flamegpu.png"));
    text = std::make_shared<Text>("Loading...", 45, textColor, fonts::findFont({ "Arial" }, fonts::GenericFontFamily::SANS).c_str());
    // Calculate offsets for vertical stacking
    const int PADDING = 10;
    const int FULL_HEIGHT = logo->getHeight() + PADDING + text->getHeight();
    const int MID_HEIGHT = FULL_HEIGHT / 2;
    logo_offset.y = MID_HEIGHT - (logo->getHeight() / 2);
    text_offset.y = MID_HEIGHT - (logo->getHeight() + PADDING + (text->getHeight() / 2));
}
std::vector<SplashScreen::OverlayItem> SplashScreen::getOverlays() const {
    return std::vector<OverlayItem>{OverlayItem{ logo, logo_offset, 0 }, OverlayItem{ text, text_offset, 0 }};
}