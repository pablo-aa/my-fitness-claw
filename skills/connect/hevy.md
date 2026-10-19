# Hevy

Hevy's API is only open to Hevy Pro accounts.

## Connect

1. Ask the user to open https://hevy.com/settings?developer in a browser, create an API key and paste it here.
2. Save it as `HEVY_API_KEY=<key>` in `.env` (replace the line if it exists).
3. Test it from the fitness folder:

   ```sh
   curl -sS -w '\n%{http_code}\n' -H "api-key: $(sed -n 's/^HEVY_API_KEY=//p' .env | tr -d '\r')" https://api.hevyapp.com/v1/user/info
   ```

   - A JSON with `"is_pro":true` passes.
   - `"is_pro":false` means the account needs Hevy Pro.
   - `401` means the key is wrong; `000` means Hevy is unreachable.

## Use

Every call is a `curl` with the same header, from the fitness folder:

```sh
curl -sS -H "api-key: $(sed -n 's/^HEVY_API_KEY=//p' .env | tr -d '\r')" "https://api.hevyapp.com/v1/<path>"
```

| Path | Returns |
|---|---|
| `workouts?page=1&pageSize=5` | The latest workouts, newest first, with every set. |
| `workouts/<id>` | One workout. |
| `routines?page=1&pageSize=10` | The user's routines with their sets. |
| `exercise_history/<exercise_template_id>` | Every past set of one exercise. |

`pageSize` is at most 10; increase `page` to go further back.
Times are UTC: convert them to the user's day before logging.
