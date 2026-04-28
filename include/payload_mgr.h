#ifndef PAYLOAD_MGR_H
#define PAYLOAD_MGR_H

#include <stddef.h>

/* 
 * Scans directories and populates json_buf with a JSON array of payloads. 
 * Returns the length of the string written. 
 */
size_t payload_mgr_list_json(char *json_buf, size_t buf_size);
int payload_mgr_resolve_path(const char *filename, char *out_path, size_t out_size);
int payload_mgr_delete_payload_file(const char *filename);

int payload_mgr_repository_ensure_fresh(int force_refresh);
size_t payload_mgr_repository_list_json(char *json_buf, size_t buf_size, int force_refresh);
int payload_mgr_repository_install_download(const char *filename, const char *install_source_detail, char *msg_buf, size_t msg_buf_size);
int payload_mgr_repository_install_commit(const char *filename, const char *temp_path, const char *install_source, const char *install_source_detail, char *msg_buf, size_t msg_buf_size);
int payload_mgr_import_to_storage(const char *filename, const char *temp_path, const char *install_source, const char *install_source_detail, char *msg_buf, size_t msg_buf_size);
int payload_mgr_check_existing(const char *filename, char *out_json, size_t out_size);
int payload_mgr_write_metadata(const char *payload_path, const char *install_source, const char *install_source_detail);
int payload_mgr_repository_push_json(const char *json, size_t len);

/* USB Import */
int payload_mgr_usb_check(const char *usb_path, char *out_json, size_t out_size);
int payload_mgr_usb_move(const char *usb_path, int overwrite, char *out_json, size_t out_size);

#endif
