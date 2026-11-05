import { useState } from 'react';
import { useCommand } from '@/lib/api';
import { Feedback } from '@/components/common/feedback';
import { Modal } from '@/components/common/modal';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export function StudentImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const command = useCommand();
  const [csv, setCsv] = useState(''),
    [fileError, setFileError] = useState('');
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="批量导入学生"
      description="支持粘贴 CSV 或从表格复制的内容。相同学号更新姓名、班级和指定配置，保留认领状态；包含「认领密钥」列时同步更新密钥，留空则清除，缺列保持原值。"
      footer={
        <Button form="import-form" type="submit" loading={command.pending}>
          导入
        </Button>
      }
    >
      <Form
        id="import-form"
        onSubmit={async e => {
          e.preventDefault();
          if (await command.run('admin/students/import', { csv: new FormData(e.currentTarget).get('csv') })) onClose();
        }}
      >
        <Feedback error={fileError || command.error} />
        <label className="flex flex-col gap-2 mb-4 text-sm">
          选择 UTF-8 CSV 文件
          <Input
            nativeInput
            type="file"
            accept=".csv,.tsv,text/csv"
            onChange={async e => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 1500000) {
                setFileError('文件过大，请分批导入');
                return;
              }
              setFileError('');
              setCsv(await file.text());
            }}
          />
        </label>
        <Textarea
          name="csv"
          value={csv}
          onChange={e => setCsv(e.target.value)}
          required
          rows={10}
          aria-label="学生名单 CSV"
          placeholder={'学号,姓名,班级,认领密钥\n20260001,张同学,软件工程一班,K7f2m9'}
        />
      </Form>
    </Modal>
  );
}
