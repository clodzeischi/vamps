// VAMPS: Cathar Protocol - entry point.
//
// Loads the map blocks, starts the FTXUI screen and a ticker thread that
// drives real-time updates (Geoscape clock, enemy turns, animations).

#include <atomic>
#include <chrono>
#include <iostream>
#include <thread>

#include <ftxui/component/component.hpp>
#include <ftxui/component/screen_interactive.hpp>

#include "tactical/MapBlocks.h"
#include "ui/App.h"
#include "ui/screens/Screens.h"

int main() {
    using namespace vamps;

    std::string err;
    if (!blockLibrary().load(dataDirectory(), err)) {
        std::cerr << "Could not load map data: " << err << "\n"
                  << "Run the game from the project folder (or keep the data/ folder next to it).\n";
        return 1;
    }

    auto screen = ftxui::ScreenInteractive::Fullscreen();
    App app(screen);
    app.start(makeMainMenu());

    auto root = ftxui::Renderer([&] { return app.render(); });
    root = ftxui::CatchEvent(root, [&](ftxui::Event e) { return app.onEvent(e); });

    // 20 ticks per second.
    std::atomic<bool> running{true};
    std::thread ticker([&] {
        while (running) {
            std::this_thread::sleep_for(std::chrono::milliseconds(50));
            screen.PostEvent(ftxui::Event::Custom);
        }
    });

    screen.Loop(root);
    running = false;
    ticker.join();
    return 0;
}
