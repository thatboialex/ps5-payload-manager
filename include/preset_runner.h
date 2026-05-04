#pragma once

#include <stddef.h>

/*
 * Immediate preset runner.
 *
 * Runs a sequence of payload entries and delay markers in a background thread,
 * fully independent from the startup autoload system. Items use the same
 * format as AUTOLOAD_LIST (filenames or "!<ms>" delay markers).
 *
 * This module never reads or writes AUTOLOAD_LIST, AUTOLOAD_ENABLED, or
 * /data/pldmgr/autoload.txt.
 */

int preset_runner_start(const char *items[], int count);
void preset_runner_abort(void);
void preset_runner_get_status(int *active, int *total, int *done,
                              char *current, size_t current_size,
                              long long *remaining_ms,
                              char *state, size_t state_size);
