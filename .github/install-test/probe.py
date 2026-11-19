"""Install the published release in a disposable Home Assistant instance."""
import asyncio
import hashlib
import logging
from pathlib import Path

from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.helpers.aiohttp_client import async_get_clientsession

REPOSITORY = "Lorilonlon/truma-inet-dashboard"
RELEASE = "v1.0.0"
FILENAME = "truma-inet-dashboard.js"


async def async_setup(hass, config):
    async def run_test(_event):
        result = Path("/config/test-result")
        try:
            hacs = hass.data["hacs"]
            await hacs.async_register_repository(repository_full_name=REPOSITORY, category="plugin")
            repo = hacs.repositories.get_by_full_name(REPOSITORY)
            assert repo and not repo.data.installed
            await repo.async_download_repository(ref=RELEASE)
            assert repo.data.installed and repo.display_installed_version == RELEASE
            await hacs.data.async_write()
            url = repo.generate_dashboard_resource_url()
            resources = hass.data["lovelace"].resources.async_items()
            assert any(r["url"] == url and r["type"] == "module" for r in resources), resources
            expected = Path("/expected", FILENAME).read_bytes()
            assert Path(repo.localpath, FILENAME).read_bytes() == expected
            async with async_get_clientsession(hass).get("http://127.0.0.1:8123" + url) as response:
                response.raise_for_status()
                assert await response.read() == expected
            result.write_text(f"PASS {RELEASE} {url} sha256={hashlib.sha256(expected).hexdigest()}\n")
        except Exception:
            logging.exception("Dashboard installation test failed")
            result.write_text("FAIL\n")

    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, run_test)
    return True
