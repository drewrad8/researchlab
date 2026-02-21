#!/bin/bash
#
# Research Lab — Installer
#
# Checks prerequisites, detects/installs Strategos, sets up data directory.
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

INSTALL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STRATEGOS_URL="${STRATEGOS_URL:-http://localhost:38007}"

banner() {
    echo -e "${BOLD}"
    echo "  ╔══════════════════════════════════╗"
    echo "  ║       Research Lab Installer      ║"
    echo "  ╚══════════════════════════════════╝"
    echo -e "${NC}"
}

check_prereqs() {
    local ok=true

    echo -e "${BLUE}Checking prerequisites...${NC}"

    # Node.js 20+
    if command -v node &> /dev/null; then
        local node_ver
        node_ver=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$node_ver" -ge 20 ]; then
            echo -e "  ${GREEN}✓${NC} Node.js $(node --version)"
        else
            echo -e "  ${RED}✗${NC} Node.js 20+ required (found $(node --version))"
            ok=false
        fi
    else
        echo -e "  ${RED}✗${NC} Node.js not found"
        ok=false
    fi

    # tmux
    if command -v tmux &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} tmux $(tmux -V 2>/dev/null || echo '')"
    else
        echo -e "  ${RED}✗${NC} tmux not found"
        ok=false
    fi

    # curl
    if command -v curl &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} curl"
    else
        echo -e "  ${RED}✗${NC} curl not found"
        ok=false
    fi

    if [ "$ok" = false ]; then
        echo ""
        echo -e "${RED}Missing prerequisites. Install them and re-run this script.${NC}"
        exit 1
    fi

    echo ""
}

detect_strategos() {
    # 1. ~/.strategos directory
    if [ -d "$HOME/.strategos" ]; then
        echo -e "  ${GREEN}✓${NC} Found ~/.strategos"
        return 0
    fi

    # 2. strategos CLI on PATH
    if command -v strategos &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} Found strategos on PATH"
        return 0
    fi

    # 3. Health endpoint
    if curl -s --connect-timeout 3 "$STRATEGOS_URL/api/health" > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} Strategos responding at $STRATEGOS_URL"
        return 0
    fi

    return 1
}

install_strategos() {
    local sibling_installer="$INSTALL_DIR/../strategos-release/install.sh"

    if [ -f "$sibling_installer" ]; then
        echo -e "${BLUE}Found local Strategos checkout at ../strategos-release${NC}"
        bash "$sibling_installer"
    else
        echo -e "${BLUE}Cloning Strategos...${NC}"
        local tmpdir
        tmpdir=$(mktemp -d)
        git clone https://github.com/drewrad8/strategos "$tmpdir/strategos"
        bash "$tmpdir/strategos/install.sh"
        rm -rf "$tmpdir"
    fi
}

setup_strategos() {
    echo -e "${BLUE}Detecting Strategos...${NC}"

    if detect_strategos; then
        echo ""
        return 0
    fi

    echo -e "  ${YELLOW}✗${NC} Strategos not found"
    echo ""
    echo "Strategos is the AI worker orchestrator that Research Lab depends on."
    echo "See: https://github.com/drewrad8/strategos"
    echo ""

    read -rp "Install Strategos now? [Y/n] " answer
    case "${answer:-Y}" in
        [Yy]*)
            install_strategos
            echo ""
            ;;
        *)
            echo ""
            echo -e "${YELLOW}Skipping Strategos install. Research Lab will not work without it.${NC}"
            echo "Install manually: https://github.com/drewrad8/strategos"
            echo ""
            ;;
    esac
}

setup_data_dir() {
    local data_dir="$HOME/.researchlab"
    if [ ! -d "$data_dir" ]; then
        echo -e "${BLUE}Creating data directory at $data_dir${NC}"
        mkdir -p "$data_dir/logs" "$data_dir/projects"
        echo -e "  ${GREEN}✓${NC} $data_dir"
    else
        echo -e "  ${GREEN}✓${NC} Data directory exists at $data_dir"
    fi
    echo ""
}

offer_path() {
    local bin_dir="$INSTALL_DIR/bin"

    # Check if already on PATH
    if echo "$PATH" | tr ':' '\n' | grep -qx "$bin_dir"; then
        echo -e "  ${GREEN}✓${NC} $bin_dir is already on PATH"
        echo ""
        return
    fi

    echo -e "Add ${BOLD}$bin_dir${NC} to your PATH for the ${BOLD}researchlab${NC} command?"
    read -rp "[Y/n] " answer
    case "${answer:-Y}" in
        [Yy]*)
            local shell_rc=""
            if [ -n "$ZSH_VERSION" ] || [ "$(basename "$SHELL")" = "zsh" ]; then
                shell_rc="$HOME/.zshrc"
            else
                shell_rc="$HOME/.bashrc"
            fi

            echo "" >> "$shell_rc"
            echo "# Research Lab" >> "$shell_rc"
            echo "export PATH=\"$bin_dir:\$PATH\"" >> "$shell_rc"
            echo -e "  ${GREEN}✓${NC} Added to $shell_rc (restart shell or run: source $shell_rc)"
            ;;
        *)
            echo -e "  Skipped. You can run it directly: ${BOLD}$bin_dir/researchlab${NC}"
            ;;
    esac
    echo ""
}

next_steps() {
    echo -e "${BOLD}Setup complete!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Start the server:  bin/researchlab start"
    echo "  2. Open in browser:   http://localhost:${RESEARCHLAB_PORT:-3700}"
    echo ""
}

# --- Main ---

banner
check_prereqs
setup_strategos
setup_data_dir
offer_path
next_steps
