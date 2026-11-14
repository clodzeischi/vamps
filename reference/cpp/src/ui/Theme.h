#pragma once
// Shared colours. Change the look of the whole game here.

#include <ftxui/screen/color.hpp>

#include "core/Color.h"

namespace vamps::theme {

inline ftxui::Color rgb(Rgb c) { return ftxui::Color::RGB(c.r, c.g, c.b); }

inline const ftxui::Color kTitle = ftxui::Color::RGB(220, 60, 60);     // blood red
inline const ftxui::Color kAccent = ftxui::Color::RGB(240, 200, 120);  // parchment gold
inline const ftxui::Color kText = ftxui::Color::RGB(210, 210, 210);
inline const ftxui::Color kDim = ftxui::Color::RGB(120, 120, 130);
inline const ftxui::Color kGood = ftxui::Color::RGB(110, 220, 120);
inline const ftxui::Color kBad = ftxui::Color::RGB(240, 90, 90);
inline const ftxui::Color kWarn = ftxui::Color::RGB(240, 190, 70);
inline const ftxui::Color kInfo = ftxui::Color::RGB(110, 180, 240);
inline const ftxui::Color kButtonBg = ftxui::Color::RGB(50, 30, 34);
inline const ftxui::Color kSelectBg = ftxui::Color::RGB(90, 40, 46);
inline const ftxui::Color kPanelBg = ftxui::Color::RGB(14, 12, 16);

} // namespace vamps::theme
