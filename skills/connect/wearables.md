# Wearables

Two ways in: Garmin through an MCP server, or a screenshot from any other watch app.
If the user already has another health MCP (e.g. Oura or open-wearables), call its tool for yesterday's steps or sleep as the test, then add it to `Connections:`.

## Garmin

Uses the community [garmin_mcp](https://github.com/Taxuspt/garmin_mcp) server, pinned to a tested commit.

1. Check for `uvx`: `command -v uvx || ls ~/.local/bin/uvx*`.
   If it is missing, install uv: `curl -LsSf https://astral.sh/uv/install.sh | sh` (on Windows: `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`).
2. Ask the user to log in once, in a separate terminal window, because it asks for the password and the MFA code:

   ```sh
   <uvx> --python 3.12 --from git+https://github.com/Taxuspt/garmin_mcp@30324f70ccb50c2570126501df17acf0b5572083 garmin-mcp-auth
   ```

   Use the full path to `uvx` from step 1 (on Windows, in its Windows form, from `cygpath -w`).
   Never ask for the Garmin password in the chat.
   Tokens are saved in `~/.garminconnect` and last about 6 months; if Garmin later fails with a login or auth error, ask the user to run this step again.
3. Add the server yourself (it only writes Claude's config), with the full path to `uvx` from step 1 and only the tools the coach needs:

   ```sh
   claude mcp add --scope user garmin -e GARMIN_ENABLED_TOOLS=get_daily_steps,get_sleep_summary_range,get_rhr_day,get_body_composition -- <uvx> --python 3.12 --from git+https://github.com/Taxuspt/garmin_mcp@30324f70ccb50c2570126501df17acf0b5572083 garmin-mcp
   ```

4. Test: `<uvx> --python 3.12 --from git+https://github.com/Taxuspt/garmin_mcp@30324f70ccb50c2570126501df17acf0b5572083 garmin-mcp-auth --verify` must print `Tokens are valid!`, and `claude mcp list` must show `garmin` as connected.
   If it fails, remove it with `claude mcp remove --scope user garmin` and say why in one line.
   New MCP servers load when a conversation starts, so the data comes in from the next conversation; say so in one line.

### Use

| Tool | Fills |
|---|---|
| `get_daily_steps(start_date, end_date)` | `steps` |
| `get_sleep_summary_range(start_date, end_date)` | `sleep_h`, in hours with one decimal |
| `get_rhr_day(date)` | `resting_hr` |
| `get_body_composition(start_date, end_date)` | `weight_kg`, empty without a Garmin scale |

Dates are `YYYY-MM-DD`; sleep on a date is the night that ended that morning.
Check the units in the response and convert to hours and kilograms.

## Any other watch: screenshot

Apple Watch, Fitbit, Samsung, Oura, Whoop and others have no simple way in.
Tell the user to drop a screenshot of the day's summary in the watch's app (or Apple Health / Google Fit) into the chat any time.
A screenshot of today taken before the day ends has partial steps: log steps only for past days.
Nothing to connect: don't add it to `Connections:`.
