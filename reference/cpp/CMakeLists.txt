cmake_minimum_required(VERSION 3.16)
project(Vamps LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON) # lets editors find src/ includes
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

# --- FTXUI: terminal UI library (fetched once, then cached in build/_deps) ---
include(FetchContent)
set(FETCHCONTENT_UPDATES_DISCONNECTED ON)
FetchContent_Declare(ftxui
  GIT_REPOSITORY https://github.com/ArthurSonzogni/FTXUI
  GIT_TAG        v6.1.9
  GIT_SHALLOW    TRUE)
FetchContent_MakeAvailable(ftxui)

# --- The game, as a library (everything except main.cpp) ---
file(GLOB_RECURSE VAMPS_SOURCES CONFIGURE_DEPENDS ${CMAKE_SOURCE_DIR}/src/*.cpp)
list(REMOVE_ITEM VAMPS_SOURCES ${CMAKE_SOURCE_DIR}/src/main.cpp)
add_library(vamps_core STATIC ${VAMPS_SOURCES})
target_include_directories(vamps_core PUBLIC ${CMAKE_SOURCE_DIR}/src)
target_link_libraries(vamps_core PUBLIC ftxui::component ftxui::dom ftxui::screen)
target_compile_definitions(vamps_core PUBLIC VAMPS_DATA_DIR="${CMAKE_SOURCE_DIR}/data")
if(CMAKE_CXX_COMPILER_ID MATCHES "Clang|GNU")
  target_compile_options(vamps_core PRIVATE -Wall -Wextra -Wno-unused-parameter)
endif()

# --- The executable ---
add_executable(vamps ${CMAKE_SOURCE_DIR}/src/main.cpp)
target_link_libraries(vamps PRIVATE vamps_core)

# --- Headless smoke test: ./build/vamps_smoke ---
add_executable(vamps_smoke ${CMAKE_SOURCE_DIR}/tests/smoke_test.cpp)
target_link_libraries(vamps_smoke PRIVATE vamps_core)
