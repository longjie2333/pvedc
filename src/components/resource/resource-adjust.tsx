import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import type { Network, Resource } from '../../../shared/schema';
import { request, useCommand } from '@/lib/api';
import {
  adjustNetworks,
  appendDraft,
  draftIssues,
  draftsFrom,
  moveDraft,
  networksChanged,
  removeDraft,
  type NicDraft,
} from '@/lib/machine-adjust';
import { useBridgeOptions } from '@/components/catalog/bridge-options';
import { FormSection } from '@/components/common/form-fields';
import { Feedback } from '@/components/common/feedback';
import { Modal } from '@/components/common/modal';
import { SpecCombobox } from '@/components/common/spec-combobox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { NicEditor } from './nic-editor';

type Spec = { cores: string; memory: string; swap: string; disk: string };

/** Administrator spec and NIC adjustment; network changes on a running machine need a shutdown confirmation. */
export function ResourceAdjust({
  resource,
  networks,
  onClose,
}: {
  resource: Resource;
  networks: Network[];
  onClose: () => void;
}) {
  const command = useCommand();
  const [drafts, setDrafts] = useState<NicDraft[]>(() => draftsFrom(resource.networks));
  const [confirming, setConfirming] = useState(false),
    [spec, setSpec] = useState<Spec>();
  const status = useQuery({
    queryKey: ['machine-status', resource.id],
    queryFn: () => request<{ data: { status: string } | null }>('admin/resources/' + resource.id + '/status'),
  });
  const running = status.data?.data?.status === 'running';
  const bridges = useBridgeOptions(drafts.some(draft => draft.source === 'custom'));
  const issues = draftIssues(drafts, bridges.query.data && bridges.items.map(item => item.value));
  const networkName = (id: string) => networks.find(network => network.id === id)?.name || '已删除网络';
  const update = (index: number, patch: Partial<NicDraft>) =>
    setDrafts(previous => previous.map((draft, itemIndex) => (itemIndex === index ? { ...draft, ...patch } : draft)));

  async function submit(confirmShutdown: boolean, values?: Spec) {
    const result = await command.run('admin/resources/' + resource.id + '/adjust', {
      spec: {
        cores: Number(values?.cores ?? resource.spec.cores),
        memory: Number(values?.memory ?? resource.spec.memory),
        swap: Number(values?.swap ?? resource.spec.swap),
        disk: Number(values?.disk ?? resource.spec.disk),
      },
      networks: adjustNetworks(drafts),
      confirmShutdown,
    });
    if (result) {
      setConfirming(false);
      onClose();
    }
  }
  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Spec;
    setSpec(values);
    if (running && networksChanged(resource.networks, drafts)) setConfirming(true);
    else void submit(false, values);
  }
  return (
    <>
      <Modal
        open={!confirming}
        onClose={onClose}
        title="调整机器配置"
        description={'VMID ' + resource.vmid + ' · ' + resource.studentId}
        footer={
          <Button form="machine-adjust" type="submit" loading={command.pending} disabled={issues.length > 0}>
            保存并应用
          </Button>
        }
      >
        <Form id="machine-adjust" className="flex flex-col gap-5" onSubmit={submitForm}>
          <Feedback error={command.error} />
          <Feedback error={bridges.query.error?.message} />
          <div className="flex flex-col divide-y [&>*]:py-5 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
            <FormSection legend="规格">
              <div className="form-grid">
                <SpecCombobox
                  name="cores"
                  label="CPU 核数"
                  initial={resource.spec.cores}
                  presets={[1, 2, 4, 8, 16]}
                  min={1}
                  max={128}
                />
                <SpecCombobox
                  name="memory"
                  label="内存 MiB"
                  initial={resource.spec.memory}
                  presets={[512, 1024, 2048, 4096, 8192, 16384]}
                  min={256}
                  max={1048576}
                />
                <SpecCombobox
                  name="swap"
                  label="交换空间 MiB"
                  initial={resource.spec.swap}
                  presets={[0, 512, 1024, 2048]}
                  min={0}
                  max={1048576}
                />
                <SpecCombobox
                  name="disk"
                  label="系统盘 GiB（只能扩容）"
                  initial={resource.spec.disk}
                  presets={[8, 16, 32, 64, 128]}
                  min={resource.spec.disk}
                  max={65536}
                />
              </div>
            </FormSection>
            <FormSection
              legend="网卡"
              description="可改用其他网络配置或自定义网桥；eth0 承担默认网关与 DNS。"
              action={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={drafts.length >= 8}
                  onClick={() => setDrafts(appendDraft)}
                >
                  <Plus />
                  添加网卡
                </Button>
              }
            >
              {drafts.map((draft, index) => (
                <NicEditor
                  key={index}
                  draft={draft}
                  primary={index === 0}
                  networks={networks}
                  onChange={patch => update(index, patch)}
                  actions={
                    <>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={'上移 ' + draft.iface}
                        disabled={index === 0}
                        onClick={() => setDrafts(previous => moveDraft(previous, index, -1))}
                      >
                        <ChevronUp />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={'下移 ' + draft.iface}
                        disabled={index === drafts.length - 1}
                        onClick={() => setDrafts(previous => moveDraft(previous, index, 1))}
                      >
                        <ChevronDown />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={'删除 ' + draft.iface}
                        disabled={drafts.length <= 1}
                        onClick={() => setDrafts(previous => removeDraft(previous, index))}
                      >
                        <Trash2 />
                      </Button>
                    </>
                  }
                />
              ))}
              {issues.length > 0 && (
                <Alert variant="error">
                  <AlertCircle aria-hidden="true" />
                  <AlertDescription className="text-foreground">
                    <ul className="flex flex-col gap-0.5">
                      {issues.map(issue => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </FormSection>
          </div>
        </Form>
      </Modal>
      <Modal
        destructive
        open={confirming}
        onClose={() => setConfirming(false)}
        title="调整网络需要先关机"
        description="容器正在运行。平台将先执行优雅关机，应用网络与规格变更，然后自动重新启动容器；请确认可以中断服务。"
        footer={
          <Button variant="destructive" loading={command.pending} onClick={() => void submit(true, spec)}>
            关机并应用调整
          </Button>
        }
      >
        <Feedback error={command.error} />
        <p className="text-sm">
          将调整 {drafts.length} 块网卡：
          {drafts
            .map(draft =>
              draft.source === 'existing' ? networkName(draft.networkId) : '自定义 ' + (draft.bridge || '未选择网桥'),
            )
            .join('、')}
          。
        </p>
      </Modal>
    </>
  );
}
